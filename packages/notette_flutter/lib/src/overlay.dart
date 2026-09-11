import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'client.dart';

/// Place in MaterialApp.builder to keep feedback available across routes.
class NotetteFeedback extends StatefulWidget {
  const NotetteFeedback(
      {super.key,
      required this.client,
      required this.child,
      required this.screenPath,
      this.screenTitle,
      this.metadata = const {},
      this.enabled = true,
      this.screenshots = false,
      this.turnstileTokenProvider});

  final NotetteClient client;
  final Widget child;

  /// Current route as a root-relative path, e.g. /settings/profile.
  final String Function() screenPath;
  final String Function()? screenTitle;
  final Map<String, Object?> metadata;
  final bool enabled;

  /// Enables an opt-in screenshot checkbox; nothing is uploaded without consent.
  final bool screenshots;

  /// Host integration must obtain a fresh, single-use token for this site key.
  final Future<String> Function(String siteKey)? turnstileTokenProvider;

  @override
  State<NotetteFeedback> createState() => _NotetteFeedbackState();
}

class _NotetteFeedbackState extends State<NotetteFeedback> {
  final _boundary = GlobalKey();
  bool _opening = false;
  Widget? _dialog;
  // Fractional travel keeps the chosen position on screen after resizing.
  Offset _launcherPosition = const Offset(1, 1);

  Future<void> _open() async {
    if (_opening || _dialog != null) return;
    setState(() => _opening = true);
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
      if (widget.screenshots) {
        try {
          final boundary = _boundary.currentContext!.findRenderObject()
              as RenderRepaintBoundary;
          final image = await boundary.toImage(pixelRatio: 1);
          try {
            final bytes =
                await image.toByteData(format: ui.ImageByteFormat.png);
            png = bytes?.buffer.asUint8List();
          } finally {
            image.dispose();
          }
        } catch (_) {
          /* Feedback remains available if capture is unsupported. */
        }
      }
      if (!mounted) return;
      setState(() => _dialog = _FeedbackForm(
            client: widget.client,
            page: page,
            metadata: Map.of(widget.metadata),
            png: png,
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
            excluding: _dialog != null,
            child: ExcludeSemantics(
                excluding: _dialog != null,
                child: RepaintBoundary(key: _boundary, child: widget.child))),
        if (widget.enabled)
          Positioned.fill(
            child: Padding(
              padding: MediaQuery.viewInsetsOf(context),
              child: SafeArea(
                minimum: const EdgeInsets.all(16),
                child: LayoutBuilder(builder: (context, constraints) {
                  const size = 48.0;
                  final travelX =
                      (constraints.maxWidth - size).clamp(0.0, double.infinity);
                  final travelY = (constraints.maxHeight - size)
                      .clamp(0.0, double.infinity);
                  return Stack(children: [
                    Positioned(
                      left: _launcherPosition.dx * travelX,
                      top: _launcherPosition.dy * travelY,
                      width: size,
                      height: size,
                      child: GestureDetector(
                        onPanUpdate: _opening
                            ? null
                            : (details) {
                                setState(() => _launcherPosition = Offset(
                                      travelX == 0
                                          ? _launcherPosition.dx
                                          : (_launcherPosition.dx +
                                                  details.delta.dx / travelX)
                                              .clamp(0.0, 1.0),
                                      travelY == 0
                                          ? _launcherPosition.dy
                                          : (_launcherPosition.dy +
                                                  details.delta.dy / travelY)
                                              .clamp(0.0, 1.0),
                                    ));
                              },
                        child: Semantics(
                          hint: 'Drag to move',
                          child: FloatingActionButton.small(
                            heroTag: null,
                            tooltip: 'Send feedback',
                            onPressed: _opening ? null : _open,
                            child: const Icon(Icons.feedback_outlined),
                          ),
                        ),
                      ),
                    ),
                  ]);
                }),
              ),
            ),
          ),
        if (_dialog != null) ...[
          const ModalBarrier(dismissible: false, color: Colors.black54),
          FocusScope(autofocus: true, child: _dialog!),
        ],
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

class _FeedbackForm extends StatefulWidget {
  const _FeedbackForm(
      {required this.client,
      required this.page,
      required this.metadata,
      required this.png,
      required this.tokenProvider,
      required this.onClose});
  final NotetteClient client;
  final Map<String, dynamic> page;
  final Map<String, Object?> metadata;
  final Uint8List? png;
  final Future<String> Function(String)? tokenProvider;
  final VoidCallback onClose;
  @override
  State<_FeedbackForm> createState() => _FeedbackFormState();
}

class _FeedbackFormState extends State<_FeedbackForm> {
  final _body = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  Map<String, dynamic>? _config;
  String? _error;
  String? _success;
  bool _busy = false;
  bool _attach = false;
  bool _signIn = false;
  bool get _signedIn => _config?['viewer'] != null;
  bool get _requiresLogin =>
      _config?['project']['anonymousFeedbackAllowed'] == false && !_signedIn;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final controller in [_body, _name, _email, _password]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() => _run(() async {
        final config = await widget.client.config();
        if (mounted) setState(() => _config = config);
      });

  Future<String?> _challenge() async {
    final key = _config?['turnstileSiteKey'] as String?;
    if (key == null) return null;
    if (widget.tokenProvider == null) {
      throw const NotetteException(
          'This server requires bot verification. The app must configure a Turnstile token provider.');
    }
    return widget.tokenProvider!(key);
  }

  Future<void> _login() => _run(() async {
        await widget.client.login(_email.text, _password.text,
            turnstileToken: await _challenge());
        _password.clear();
        final config = await widget.client.config();
        if (mounted)
          setState(() {
            _config = config;
            _signIn = false;
          });
      });

  Future<void> _submit() => _run(() async {
        if (_body.text.trim().isEmpty)
          throw const NotetteException('Please enter your feedback.');
        final result = await widget.client.createFeedback({
          'body': _body.text.trim(),
          'page': widget.page,
          'author': {'name': _name.text.trim(), 'email': _email.text.trim()},
          'metadata': {'framework': 'flutter', ...widget.metadata},
          if (!_signedIn) 'turnstileToken': await _challenge(),
        });
        var message = 'Feedback sent. Thank you!';
        if (_attach && widget.png != null && result['uploadToken'] != null) {
          try {
            await widget.client.uploadScreenshot(result['item']['id'] as String,
                result['uploadToken'] as String, widget.png!);
          } catch (_) {
            message =
                'Feedback sent, but the screenshot could not be uploaded.';
          }
        }
        if (mounted) setState(() => _success = message);
      });

  @override
  Widget build(BuildContext context) {
    final login = _requiresLogin || _signIn;
    return AlertDialog(
      title: Text(_success != null
          ? 'Thank you'
          : login
              ? 'Sign in to Notette'
              : 'Send feedback'),
      content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
              child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_success != null)
                Text(_success!)
              else if (_config != null) ...[
                if (login) ...[
                  TextField(
                      controller: _email,
                      enabled: !_busy,
                      maxLength: 254,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email')),
                  TextField(
                      controller: _password,
                      enabled: !_busy,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password')),
                ] else ...[
                  TextField(
                      controller: _body,
                      enabled: !_busy,
                      minLines: 3,
                      maxLines: 6,
                      maxLength: 5000,
                      decoration: const InputDecoration(
                          labelText: 'What could be better?')),
                  if (!_signedIn) ...[
                    TextField(
                        controller: _name,
                        enabled: !_busy,
                        maxLength: 120,
                        decoration: const InputDecoration(
                            labelText: 'Name (optional)')),
                    TextField(
                        controller: _email,
                        enabled: !_busy,
                        maxLength: 254,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                            labelText: 'Email (optional)')),
                    TextButton(
                        onPressed:
                            _busy ? null : () => setState(() => _signIn = true),
                        child: const Text('Sign in')),
                  ] else
                    TextButton(
                        onPressed: _busy
                            ? null
                            : () => _run(() async {
                                  await widget.client.logout();
                                  final config = await widget.client.config();
                                  if (mounted) setState(() => _config = config);
                                }),
                        child: const Text('Sign out')),
                  if (widget.png != null &&
                      _config!['project']['screenshotsEnabled'] == true) ...[
                    CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Include screenshot'),
                        value: _attach,
                        onChanged:
                            _busy ? null : (v) => setState(() => _attach = v!)),
                    if (_attach)
                      Image.memory(widget.png!,
                          height: 140, fit: BoxFit.contain),
                  ],
                ],
              ],
              if (_busy) const LinearProgressIndicator(),
              if (_error != null)
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ))),
      actions: [
        TextButton(
            onPressed: _busy ? null : widget.onClose,
            child: const Text('Close')),
        if (_signIn && !_requiresLogin && _success == null)
          TextButton(
              onPressed: _busy ? null : () => setState(() => _signIn = false),
              child: const Text('Back')),
        if (_success == null)
          TextButton(
              onPressed: _busy
                  ? null
                  : _config == null
                      ? _load
                      : login
                          ? _login
                          : _submit,
              child: Text(_config == null
                  ? 'Retry'
                  : login
                      ? 'Sign in'
                      : 'Send')),
      ],
    );
  }
}
