import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'client.dart';
import 'turnstile.dart';

part 'panels.dart';
part 'form.dart';
part 'action_bar.dart';

/// Place in MaterialApp.builder to keep feedback available across routes.
class NotetteFeedback extends StatefulWidget {
  const NotetteFeedback(
      {super.key,
      required this.client,
      required this.child,
      required this.screenPath,
      this.screenTitle,
      this.controller,
      this.initiallyOpen = false,
      this.position = Alignment.bottomRight,
      this.user = const {},
      this.deployment = const {},
      this.onNavigate,
      this.openUrl,
      this.initialFeedbackId,
      this.resolvePin,
      this.metadata = const {},
      this.enabled = true,
      this.screenshots = true,
      this.turnstileTokenProvider});

  final NotetteController? controller;
  final bool initiallyOpen;
  final Alignment position;
  final Map<String, String> user;
  final Map<String, String> deployment;

  /// Called only on explicit navigation to feedback on another native screen.
  final Future<void> Function(String path)? onNavigate;

  /// Override the system browser (e.g. for an application's link handler).
  final Future<bool> Function(Uri url)? openUrl;
  final String? initialFeedbackId;

  /// Optional native anchor lookup; return logical screen coordinates.
  final Offset? Function(Map<String, dynamic> item, Size viewport)? resolvePin;
  final NotetteClient client;
  final Widget child;

  /// Current route as a root-relative path, e.g. /settings/profile.
  final String Function() screenPath;
  final String Function()? screenTitle;
  final Map<String, Object?> metadata;
  final bool enabled;

  /// Enables screenshot attachments, with a remembered user checkbox preference.
  final bool screenshots;

  /// Optional override for the built-in challenge. Return a fresh token per call.
  final Future<String> Function(String siteKey)? turnstileTokenProvider;

  @override
  State<NotetteFeedback> createState() => _NotetteFeedbackState();
}

class _NotetteFeedbackState extends State<NotetteFeedback> {
  final _boundary = GlobalKey();
  bool _opening = false;
  int _captureGeneration = 0;
  bool _placing = false;
  bool _includeScreenshot = true;
  static const _screenshotPreference = 'notette.includeScreenshot';
  Future<void>? _preferenceWrite;
  Widget? _dialog;
  bool _expanded = false;
  bool _activating = false;
  bool _pinsVisible = true;
  String _status = 'open';
  String _path = '';
  String? _error;
  Map<String, dynamic>? _config;
  List<Map<String, dynamic>> _items = [];
  Timer? _pathTimer;
  int _loadGeneration = 0;
  String? _pendingFocus;
  bool _ready = false;
  bool get _admin => _config?['viewer']?['admin'] == true;
  bool get _canSee =>
      _admin ||
      (_config?['project']?['publicFeedbackVisible'] == true &&
          (_config?['project']?['anonymousFeedbackAllowed'] != false ||
              _config?['viewer'] != null));

  @override
  void initState() {
    super.initState();
    _launcherPosition = Offset(widget.position.x < 0 ? 0 : 1, 1);
    widget.controller?._state = this;
    _pendingFocus = widget.initialFeedbackId ??
        (kIsWeb ? Uri.base.queryParameters['notette'] : null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && (widget.initiallyOpen || _pendingFocus != null)) _expand();
    });
    _pathTimer = Timer.periodic(const Duration(milliseconds: 750), (_) {
      if (!mounted || !_ready || !widget.enabled) return;
      try {
        final path = widget.screenPath();
        if (path != _path) {
          _path = path;
          _items = [];
          if (_dialog is _BrowsePanel) _browse();
          _reload();
        }
      } catch (_) {/* A router may briefly have no current route. */}
    });
  }

  @override
  void didUpdateWidget(NotetteFeedback oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?._state = null;
      widget.controller?._state = this;
    }
    if (oldWidget.client != widget.client) {
      _loadGeneration++;
      _captureGeneration++;
      _ready = false;
      _config = null;
      _items = [];
      _dialog = null;
      _placing = false;
      if (_expanded) _expand();
    }
    if (!widget.enabled) {
      _captureGeneration++;
      _dialog = null;
      _placing = false;
      _expanded = false;
    }
  }

  @override
  void dispose() {
    _pathTimer?.cancel();
    widget.controller?._state = null;
    super.dispose();
  }

  Future<void> _activateLauncher() async {
    if (_activating) return;
    setState(() => _activating = true);
    try {
      await _expand();
      if (!mounted || !widget.enabled) return;
      if (_config != null && _config!['viewer'] == null) {
        setState(() => _expanded = false);
        _showForm(authOnly: true);
      }
    } finally {
      if (mounted) setState(() => _activating = false);
    }
  }

  Future<void> _expand() async {
    setState(() {
      _expanded = true;
      _error = null;
    });
    final client = widget.client;
    if (!_ready) {
      await client.restoreSession();
      if (!mounted || widget.client != client || !widget.enabled) return;
      try {
        final prefs = await SharedPreferences.getInstance();
        _status =
            prefs.getString('${widget.client.storageKey}:status') ?? 'open';
        if (!['open', 'resolved', 'all'].contains(_status)) _status = 'open';
        _pinsVisible =
            prefs.getBool('${widget.client.storageKey}:pins') ?? true;
      } catch (_) {}
      if (!mounted) return;
      _ready = true;
    }
    await _reload();
    if (mounted && _pendingFocus != null) {
      if (_config?['viewer'] == null &&
          _config?['project']?['anonymousFeedbackAllowed'] == false) {
        _showForm(authOnly: true);
      } else {
        final id = _pendingFocus!;
        _pendingFocus = null;
        _focus(id);
      }
    }
  }

  Future<void> _reload() async {
    final generation = ++_loadGeneration;
    try {
      final path = widget.screenPath();
      final config = await widget.client.config();
      if (!mounted || generation != _loadGeneration) return;
      if (config['viewer'] == null && widget.client.token != null) {
        widget.client.token = null;
        await widget.client.saveSession();
      }
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _config = config;
        _path = path;
        _error = null;
      });
      final items =
          _canSee ? await widget.client.listFeedback(path) : {'items': []};
      if (!mounted ||
          generation != _loadGeneration ||
          widget.screenPath() != path) return;
      setState(() => _items = _maps(items['items']));
    } catch (e) {
      if (mounted && generation == _loadGeneration)
        setState(() => _error = '$e');
    }
  }

  void _collapse() => setState(() {
        _expanded = false;
        _dialog = null;
        _placing = false;
      });
  void _closeDialog() {
    if (!mounted) return;
    setState(() => _dialog = null);
  }

  Future<void> _setStatusFilter(String value) async {
    setState(() => _status = value);
    try {
      await (await SharedPreferences.getInstance())
          .setString('${widget.client.storageKey}:status', value);
    } catch (_) {}
  }

  void _togglePins() {
    setState(() => _pinsVisible = !_pinsVisible);
    () async {
      try {
        await (await SharedPreferences.getInstance())
            .setBool('${widget.client.storageKey}:pins', _pinsVisible);
      } catch (_) {}
    }();
  }

  void _browse() {
    if (!_canSee) return;
    setState(() {
      _placing = false;
      _dialog = _BrowsePanel(
        key: UniqueKey(),
        client: widget.client,
        path: _path,
        config: _config!,
        status: _status,
        onStatus: _setStatusFilter,
        onSelect: _focus,
        onClose: _closeDialog,
      );
    });
  }

  Future<void> _focus(String id) async {
    if (!_ready) {
      _pendingFocus = id;
      await _expand();
      return;
    }
    if (_config?['project']?['anonymousFeedbackAllowed'] == false &&
        _config?['viewer'] == null) {
      _pendingFocus = id;
      _showForm(authOnly: true);
      return;
    }
    setState(() => _expanded = true);
    _showForm(detailId: id);
  }

  void _showForm({bool authOnly = false, String? detailId}) {
    setState(() {
      _placing = false;
      _dialog = _FeedbackForm(
        key: UniqueKey(),
        client: widget.client,
        page: const {},
        metadata: widget.metadata,
        png: null,
        pin: Offset.zero,
        includeScreenshot: _includeScreenshot,
        onScreenshotChanged: _rememberScreenshot,
        tokenProvider: widget.turnstileTokenProvider,
        onClose: _closeDialog,
        onChanged: _changed,
        authOnly: authOnly,
        alignment: widget.position,
        detailId: detailId,
        user: widget.user,
        deployment: widget.deployment,
        openUrl: widget.openUrl,
        onNavigate: widget.onNavigate,
      );
    });
  }

  void _changed() {
    _reload().then((_) {
      if (!mounted) return;
      if (_config?['viewer'] != null) setState(() => _expanded = true);
      if (_pendingFocus != null && _config?['viewer'] != null) {
        final id = _pendingFocus!;
        _pendingFocus = null;
        _focus(id);
      }
    });
  }

  void _account() {
    if (_config?['viewer'] == null) {
      _showForm(authOnly: true);
      return;
    }
    setState(() => _dialog = _AccountPanel(
        client: widget.client,
        config: _config!,
        onClose: _closeDialog,
        onChanged: _changed,
        onSignOut: () {
          _closeDialog();
          setState(() {
            _items = [];
            _config?['viewer'] = null;
            if (_config?['project']?['anonymousFeedbackAllowed'] == false)
              _expanded = false;
          });
          _reload();
        }));
  }

  // Fractional travel keeps the chosen position on screen after resizing.
  Offset _launcherPosition = const Offset(1, 1);

  void _placePin() {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _placing = true;
      _dialog = null;
    });
  }

  void _rememberScreenshot(bool value) {
    _includeScreenshot = value;
    _preferenceWrite = (_preferenceWrite ?? Future.value()).then((_) async {
      try {
        final preferences = await SharedPreferences.getInstance();
        await preferences.setBool(_screenshotPreference, value);
      } catch (_) {
        // Keep the choice for this overlay if device storage is unavailable.
      }
    });
  }

  Future<void> _open(Offset pin) async {
    if (_opening || _dialog != null) return;
    final generation = ++_captureGeneration;
    setState(() {
      _opening = true;
      _placing = false;
    });
    try {
      final path = widget.screenPath();
      if (!path.startsWith('/') ||
          path.startsWith('//') ||
          path.contains('\\')) {
        throw ArgumentError('screenPath must be a root-relative path.');
      }
      final url = Uri.parse(widget.client.origin).resolve(path);
      if (url.origin != widget.client.origin)
        throw ArgumentError('Invalid screen path.');
      final media = MediaQuery.of(context);
      final page = <String, dynamic>{
        'url': url.toString(),
        if (widget.screenTitle != null) 'title': widget.screenTitle!(),
        'viewportWidth': media.size.width.round(),
        'viewportHeight': media.size.height.round(),
        'devicePixelRatio': media.devicePixelRatio.clamp(0, 10),
        'scrollX': 0,
        'scrollY': 0,
        'userAgent': 'Flutter/${kIsWeb ? 'web' : defaultTargetPlatform.name}',
      };
      Uint8List? png;
      if (widget.screenshots &&
          _config?['project']?['screenshotsEnabled'] != false) {
        try {
          final boundary = _boundary.currentContext!.findRenderObject()
              as RenderRepaintBoundary;
          final image = await boundary.toImage(pixelRatio: 1);
          try {
            final recorder = ui.PictureRecorder();
            final canvas = Canvas(recorder)
              ..drawImage(image, Offset.zero, Paint());
            canvas.drawCircle(pin, 10, Paint()..color = Colors.white);
            canvas.drawCircle(pin, 7, Paint()..color = const Color(0xff4f46e5));
            final picture = recorder.endRecording();
            try {
              final marked = await picture.toImage(image.width, image.height);
              try {
                final bytes =
                    await marked.toByteData(format: ui.ImageByteFormat.png);
                png = bytes?.buffer.asUint8List();
              } finally {
                marked.dispose();
              }
            } finally {
              picture.dispose();
            }
          } finally {
            image.dispose();
          }
        } catch (_) {
          /* Feedback remains available if capture is unsupported. */
        }
      }
      if (!mounted) return;
      if (_preferenceWrite != null) await _preferenceWrite;
      try {
        final preferences = await SharedPreferences.getInstance();
        _includeScreenshot =
            preferences.getBool(_screenshotPreference) ?? _includeScreenshot;
      } catch (_) {
        // Feedback remains available without device storage.
      }
      if (!mounted || !widget.enabled || generation != _captureGeneration)
        return;
      setState(() => _dialog = _FeedbackForm(
            key: UniqueKey(),
            client: widget.client,
            onChanged: _changed,
            alignment: widget.position,
            user: widget.user,
            deployment: widget.deployment,
            openUrl: widget.openUrl,
            onNavigate: widget.onNavigate,
            page: page,
            metadata: Map.of(widget.metadata),
            png: png,
            pin: pin,
            includeScreenshot: _includeScreenshot,
            onScreenshotChanged: _rememberScreenshot,
            tokenProvider: widget.turnstileTokenProvider,
            onClose: () {
              if (mounted) setState(() => _dialog = null);
            },
          ));
    } catch (error) {
      if (mounted) {
        setState(() => _dialog = AlertDialog(
              title: const Text('Feedback unavailable'),
              content: Text('$error'),
              actions: [
                TextButton(
                    onPressed: () => setState(() => _dialog = null),
                    child: const Text('Close'))
              ],
            ));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => _OverlayHost(
          child: Stack(fit: StackFit.expand, children: [
        ExcludeFocus(
            excluding: _dialog != null || _placing || _opening,
            child: ExcludeSemantics(
                excluding: _dialog != null || _placing || _opening,
                child: RepaintBoundary(key: _boundary, child: widget.child))),
        Positioned.fill(
            child: Theme(
                data: _notetteTheme(),
                child: Stack(children: [
                  if (widget.enabled &&
                      _expanded &&
                      !_activating &&
                      _pinsVisible &&
                      _canSee &&
                      !_placing &&
                      !_opening)
                    ..._items
                        .where((item) =>
                            _status == 'all' || item['status'] == _status)
                        .where((item) =>
                            item['clickX'] != null && item['clickY'] != null)
                        .map((item) {
                      final media = MediaQuery.sizeOf(context);
                      final fallbackX = (item['clickX'] as num).toDouble() *
                          media.width /
                          ((item['viewportWidth'] as num?)
                                  ?.toDouble()
                                  .clamp(1, double.infinity) ??
                              media.width);
                      final fallbackY = (item['clickY'] as num).toDouble() *
                          media.height /
                          ((item['viewportHeight'] as num?)
                                  ?.toDouble()
                                  .clamp(1, double.infinity) ??
                              media.height);
                      final anchor = widget.resolvePin?.call(item, media);
                      final x = anchor?.dx ?? fallbackX;
                      final y = anchor?.dy ?? fallbackY;
                      return Positioned(
                          left:
                              (x - 15).clamp(0, math.max(0, media.width - 30)),
                          top:
                              (y - 15).clamp(0, math.max(0, media.height - 30)),
                          child: Tooltip(
                              message: '#${item['number']} ${item['body']}',
                              child: Material(
                                color: item['status'] == 'resolved'
                                    ? const Color(0xff16a34a)
                                    : _accent,
                                elevation: 4,
                                shape: const CircleBorder(
                                    side: BorderSide(
                                        color: Colors.white, width: 2)),
                                child: InkWell(
                                    customBorder: const CircleBorder(),
                                    onTap: () => _focus(item['id'] as String),
                                    child: SizedBox(
                                        width: 30,
                                        height: 30,
                                        child: Center(
                                            child: Text('${item['number']}',
                                                style: const TextStyle(
                                                    color: Colors.white,
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 12))))),
                              )));
                    }),
                  if (widget.enabled &&
                      _expanded &&
                      !_activating &&
                      _error != null &&
                      _dialog == null)
                    Positioned(
                        left: 16,
                        right: 16,
                        bottom: 84,
                        child: Material(
                            color: const Color(0xfffef2f2),
                            borderRadius: BorderRadius.circular(10),
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Row(children: [
                                  Expanded(child: Text(_error!)),
                                  TextButton(
                                      onPressed: _reload,
                                      child: const Text('Retry'))
                                ])))),
                  if (_placing) ...[
                    Positioned.fill(
                      child: GestureDetector(
                        key: const ValueKey('notette-pin-placement'),
                        behavior: HitTestBehavior.opaque,
                        onTapUp: (details) => _open(details.localPosition),
                        child: Focus(
                            autofocus: true,
                            onKeyEvent: (_, event) {
                              if (event is KeyDownEvent &&
                                  event.logicalKey ==
                                      LogicalKeyboardKey.escape) {
                                setState(() => _placing = false);
                                return KeyEventResult.handled;
                              }
                              return KeyEventResult.ignored;
                            },
                            child: const MouseRegion(
                              cursor: SystemMouseCursors.precise,
                              child: SizedBox.expand(),
                            )),
                      ),
                    ),
                  ],
                  if (widget.enabled &&
                      !_opening &&
                      (_dialog == null || !_expanded))
                    Positioned.fill(
                        key: const ValueKey('notette-floating-actions'),
                        child: _FloatingActions(
                          position: _launcherPosition,
                          onMove: (position) =>
                              setState(() => _launcherPosition = position),
                          expanded: _expanded && !_activating,
                          placing: _placing,
                          activate: _activating ? null : _activateLauncher,
                          comment: _placePin,
                          cancel: () => setState(() => _placing = false),
                          canSee: _canSee,
                          pinsVisible: _pinsVisible,
                          pinCount:
                              _items.where((i) => i['status'] == 'open').length,
                          togglePins: _togglePins,
                          browse: _browse,
                          account: _account,
                          viewer: _config?['viewer'],
                          close: _collapse,
                        )),
                  if (_opening) const ModalBarrier(dismissible: false),
                  if (_dialog != null) ...[
                    const ModalBarrier(
                        dismissible: false, color: Colors.transparent),
                    FocusScope(
                        autofocus: true,
                        child: _Reveal(key: _dialog!.key, child: _dialog!)),
                  ],
                ]))),
      ]));
}

// MaterialApp.builder is above the navigator's Overlay. Text selection and
// tooltips need their own Overlay ancestor here, including on older Flutter.
class _OverlayHost extends StatefulWidget {
  const _OverlayHost({required this.child});
  final Widget child;
  @override
  State<_OverlayHost> createState() => _OverlayHostState();
}

class _OverlayHostState extends State<_OverlayHost> {
  late final _entry = OverlayEntry(builder: (_) => widget.child);
  @override
  void didUpdateWidget(_OverlayHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    _entry.markNeedsBuild();
  }

  @override
  void dispose() {
    _entry.remove();
    _entry.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Overlay(initialEntries: [_entry]);
}

/// Imperative counterparts to the web widget's open/close/comment/list/focus API.
class NotetteController {
  _NotetteFeedbackState? _state;
  void open() => _state?._expand();
  void close() => _state?._collapse();
  void comment() {
    _state?._expand();
    _state?._placePin();
  }

  void list() async {
    await _state?._expand();
    _state?._browse();
  }

  void focus(String id) => _state?._focus(id);
  void refresh() => _state?._reload();
}
