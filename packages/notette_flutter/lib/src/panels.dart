part of 'overlay.dart';

const _accent = Color(0xff4f46e5);
const _soft = Color(0xffeef2ff);
const _border = Color(0xffe1e4ea);
const _muted = Color(0xff5b6472);
List<Map<String, dynamic>> _maps(dynamic value) => value is List
    ? value.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList()
    : [];
String _initials(dynamic name) => (name?.toString().trim().isNotEmpty == true)
    ? name
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s[0].toUpperCase())
        .join()
    : 'A';
String _age(dynamic value) {
  final date = DateTime.tryParse('$value');
  if (date == null) return '';
  final elapsed = DateTime.now().difference(date);
  if (elapsed.inMinutes < 1) return 'Just now';
  if (elapsed.inHours < 1) return '${elapsed.inMinutes}m ago';
  if (elapsed.inDays < 1) return '${elapsed.inHours}h ago';
  return '${elapsed.inDays}d ago';
}

ThemeData _notetteTheme() => ThemeData(
      fontFamily: 'Roboto',
      visualDensity: VisualDensity.standard,
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
          seedColor: _accent, primary: _accent, surface: Colors.white),
      scaffoldBackgroundColor: Colors.white,
      textTheme: const TextTheme(
          bodyMedium:
              TextStyle(fontSize: 13, height: 1.45, color: Color(0xff14181f)),
          bodySmall: TextStyle(fontSize: 11.5, color: _muted),
          titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          titleMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xfff4f5f8),
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(6),
              borderSide: const BorderSide(color: _border)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(6),
              borderSide: const BorderSide(color: _border)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(6),
              borderSide: const BorderSide(color: _accent, width: 1.5))),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              backgroundColor: _accent,
              textStyle: const TextStyle(
                  fontFamily: 'Roboto',
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6)))),
      textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
              textStyle: const TextStyle(fontFamily: 'Roboto', fontSize: 12.5),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6)))),
    );

Future<void> _launch(String value, Future<bool> Function(Uri)? override) async {
  final uri = Uri.tryParse(value);
  if (uri == null ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.host.isEmpty) {
    throw const NotetteException('This link is not a valid web address.');
  }
  if (!await (override?.call(uri) ??
      launchUrl(uri, mode: LaunchMode.externalApplication))) {
    throw const NotetteException(
        'Could not open the browser. Use the link below to continue.');
  }
}

class _Card extends StatelessWidget {
  const _Card(
      {required this.title,
      required this.child,
      required this.onClose,
      this.actions = const [],
      this.auth = false,
      this.alignment = Alignment.bottomRight});
  final bool auth;
  final Alignment alignment;
  final String title;
  final Widget child;
  final VoidCallback onClose;
  final List<Widget> actions;
  final double width = 400;
  @override
  Widget build(BuildContext context) => CallbackShortcuts(
        bindings: {const SingleActivator(LogicalKeyboardKey.escape): onClose},
        child: auth
            ? Focus(
                autofocus: true,
                child: _AuthCard(
                    title: title,
                    onClose: onClose,
                    alignment: alignment,
                    child: child,
                    actions: actions))
            : AlertDialog(
                backgroundColor: Colors.white,
                surfaceTintColor: Colors.transparent,
                elevation: 12,
                alignment: MediaQuery.sizeOf(context).width > 650
                    ? Alignment.centerRight
                    : Alignment.center,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: const BorderSide(color: _border)),
                insetPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                titlePadding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
                contentPadding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                title: Row(children: [
                  Expanded(
                      child: Text(title,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700))),
                  IconButton(
                      tooltip: 'Close',
                      onPressed: onClose,
                      icon: const Icon(Icons.close, size: 18))
                ]),
                content: SizedBox(
                    width: width, child: SingleChildScrollView(child: child)),
                actions: actions,
              ),
      );
}

class _Field extends StatelessWidget {
  const _Field(this.label,
      {required this.controller,
      this.enabled = true,
      this.maxLength,
      this.minLines = 1,
      this.maxLines = 1,
      this.keyboardType,
      this.onChanged});
  final String label;
  final TextEditingController controller;
  final bool enabled;
  final int? maxLength;
  final int minLines, maxLines;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Semantics(
            label: label,
            child: TextField(
                controller: controller,
                enabled: enabled,
                maxLength: maxLength,
                minLines: minLines,
                maxLines: maxLines,
                keyboardType: keyboardType,
                onChanged: onChanged,
                decoration:
                    const InputDecoration(filled: true, counterText: ''))),
      ]));
}

class _BrowsePanel extends StatefulWidget {
  const _BrowsePanel(
      {super.key,
      required this.client,
      required this.path,
      required this.config,
      required this.status,
      required this.onStatus,
      required this.onSelect,
      required this.onClose});
  final NotetteClient client;
  final String path, status;
  final Map<String, dynamic> config;
  final ValueChanged<String> onStatus, onSelect;
  final VoidCallback onClose;
  @override
  State<_BrowsePanel> createState() => _BrowsePanelState();
}

class _BrowsePanelState extends State<_BrowsePanel> {
  final _search = TextEditingController();
  late String _status;
  late bool _project;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  int _generation = 0;
  Timer? _debounce;
  bool get _admin => widget.config['viewer']?['admin'] == true;
  @override
  void initState() {
    super.initState();
    _status = widget.status;
    _project = _admin;
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.client.listFeedback(widget.path,
          project: _project, status: _status, query: _search.text.trim());
      if (mounted && generation == _generation)
        setState(() => _items = _maps(response['items']));
    } catch (e) {
      if (mounted && generation == _generation) setState(() => _error = '$e');
    } finally {
      if (mounted && generation == _generation)
        setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final items = _items
        .where((i) =>
            (_status == 'all' || i['status'] == _status) &&
            (query.isEmpty ||
                '${i['body']} ${i['authorName']} #${i['number']}'
                    .toLowerCase()
                    .contains(query)))
        .toList();
    return _Card(
        title: '${widget.config['project']?['name'] ?? 'Feedback'}',
        onClose: widget.onClose,
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_admin)
            Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: true, label: Text('All pages')),
                      ButtonSegment(value: false, label: Text('This page'))
                    ],
                    selected: {
                      _project
                    },
                    onSelectionChanged: (v) {
                      setState(() => _project = v.first);
                      _load();
                    })),
          Row(children: [
            Expanded(
                child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'open', label: Text('Open')),
                ButtonSegment(value: 'resolved', label: Text('Resolved')),
                ButtonSegment(value: 'all', label: Text('All'))
              ],
              selected: {_status},
              onSelectionChanged: (values) {
                final value = values.first;
                setState(() => _status = value);
                widget.onStatus(value);
                _load();
              },
            )),
            IconButton(
                tooltip: 'Refresh feedback',
                onPressed: _load,
                icon: const Icon(Icons.refresh, size: 18))
          ]),
          const SizedBox(height: 12),
          _Field('Search feedback', controller: _search, onChanged: (_) {
            _generation++;
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 200), _load);
            setState(() {});
          }),
          Text('${items.length} ${items.length == 1 ? 'item' : 'items'}',
              style: Theme.of(context).textTheme.bodySmall),
          if (_loading)
            const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator()),
          if (_error != null) ...[
            Text(_error!, style: const TextStyle(color: Colors.red)),
            TextButton(onPressed: _load, child: const Text('Retry'))
          ],
          if (!_loading && _error == null && items.isEmpty)
            const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No feedback matches.')),
          ...items.map((item) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Material(
                  color: const Color(0xfff4f5f8),
                  borderRadius: BorderRadius.circular(6),
                  child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: () => widget.onSelect(item['id'] as String),
                      child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _StatusNumber(item),
                                const SizedBox(width: 10),
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Text('${item['body']}',
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis),
                                      const SizedBox(height: 6),
                                      Text(
                                          '${item['authorName'] ?? 'Anonymous'} · ${_age(item['createdAt'])} · ${item['commentCount'] ?? 0} replies',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                      if (item['path'] != widget.path)
                                        Text('${item['path']}',
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall)
                                    ])),
                              ])))))),
        ]));
  }
}

class _StatusNumber extends StatelessWidget {
  const _StatusNumber(this.item);
  final Map<String, dynamic> item;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
          color: item['status'] == 'resolved' ? const Color(0xffecfdf5) : _soft,
          borderRadius: BorderRadius.circular(6)),
      child: Text('#${item['number']}',
          style: TextStyle(
              color: item['status'] == 'resolved'
                  ? const Color(0xff16a34a)
                  : _accent,
              fontWeight: FontWeight.w700,
              fontSize: 12)));
}

class _AccountPanel extends StatefulWidget {
  const _AccountPanel(
      {required this.client,
      required this.config,
      required this.onClose,
      required this.onChanged,
      required this.onSignOut});
  final NotetteClient client;
  final Map<String, dynamic> config;
  final VoidCallback onClose, onChanged, onSignOut;
  @override
  State<_AccountPanel> createState() => _AccountPanelState();
}

class _AccountPanelState extends State<_AccountPanel> {
  bool _busy = false;
  late bool _email = widget.config['viewer']?['emailNotifications'] != false;
  String? _error;
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

  @override
  Widget build(BuildContext context) => _Card(
      title: 'Account',
      onClose: widget.onClose,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          CircleAvatar(
              backgroundColor: _soft,
              child: Text(_initials(widget.config['viewer']?['name']))),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('${widget.config['viewer']?['name'] ?? ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('${widget.config['viewer']?['email'] ?? ''}'),
                Text(
                    widget.config['viewer']?['admin'] == true
                        ? 'Admin'
                        : 'Member',
                    style: const TextStyle(color: _accent, fontSize: 11))
              ]))
        ]),
        const SizedBox(height: 16),
        if (widget.config['emailEnabled'] == true)
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Email notifications for this site'),
              subtitle: const Text(
                  'New feedback, replies and @-mentions, grouped into one email.'),
              value: _email,
              onChanged: _busy
                  ? null
                  : (v) => _run(() async {
                        final result = await widget.client.setNotifications(v!);
                        if (mounted)
                          setState(() => _email = result['email'] == true);
                        widget.onChanged();
                      })),
        if (_busy) const LinearProgressIndicator(),
        if (_error != null)
          Text(_error!, style: const TextStyle(color: Colors.red)),
        TextButton.icon(
            onPressed: _busy
                ? null
                : () => _run(() async {
                      try {
                        await widget.client.logout();
                      } finally {
                        widget.onSignOut();
                      }
                    }),
            icon: const Icon(Icons.logout, size: 16),
            label: const Text('Sign out')),
      ]));
}

class _MentionEditor extends StatefulWidget {
  const _MentionEditor(
      {required this.controller,
      required this.candidates,
      required this.onMentions,
      required this.enabled,
      required this.label});
  final TextEditingController controller;
  final List<Map<String, dynamic>> candidates;
  final ValueChanged<List<String>> onMentions;
  final bool enabled;
  final String label;
  @override
  State<_MentionEditor> createState() => _MentionEditorState();
}

class _MentionEditorState extends State<_MentionEditor> {
  final Map<String, String> _selected = {};
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    _selected
        .removeWhere((id, name) => !widget.controller.text.contains('@$name'));
    widget.onMentions(_selected.keys.toList());
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final offset = widget.controller.selection.baseOffset;
    final before = offset >= 0 && offset <= widget.controller.text.length
        ? widget.controller.text.substring(0, offset)
        : '';
    final match = RegExp(r'(?:^|\s)@([^@\n]*)$').firstMatch(before);
    final query = match?.group(1)?.toLowerCase();
    final candidates = query == null
        ? <Map<String, dynamic>>[]
        : widget.candidates
            .where((c) => '${c['name']}'.toLowerCase().contains(query))
            .take(6)
            .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _Field(widget.label,
          controller: widget.controller,
          enabled: widget.enabled,
          minLines: 3,
          maxLines: 6,
          maxLength: 5000),
      if (candidates.isNotEmpty && widget.enabled)
        Material(
            color: _soft,
            borderRadius: BorderRadius.circular(6),
            child: Column(
                children: candidates
                    .map((c) => ListTile(
                        dense: true,
                        title: Text('@${c['name']}'),
                        subtitle: Text(c['admin'] == true ? 'Admin' : 'Member'),
                        onTap: () {
                          final start = before.lastIndexOf('@');
                          final replacement = '@${c['name']} ';
                          _selected[c['id'] as String] = c['name'] as String;
                          widget.controller.value = TextEditingValue(
                              text: widget.controller.text
                                  .replaceRange(start, offset, replacement),
                              selection: TextSelection.collapsed(
                                  offset: start + replacement.length));
                        }))
                    .toList())),
    ]);
  }
}

Widget _message(Map<String, dynamic> message, {bool root = false}) => Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: root ? _soft : const Color(0xfff4f5f8),
          borderRadius: BorderRadius.circular(6)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(
            spacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('${message['authorName'] ?? 'Anonymous'}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 12)),
              if (message['isAdmin'] == true || message['isMember'] == true)
                Text(message['isAdmin'] == true ? 'admin' : 'member',
                    style: const TextStyle(color: _accent, fontSize: 11)),
              Text(_age(message['createdAt']),
                  style: const TextStyle(color: _muted, fontSize: 11)),
            ]),
        const SizedBox(height: 6),
        _MentionText('${message['body'] ?? ''}',
            (message['mentions'] as List? ?? []).map((e) => '$e').toList()),
      ]),
    );

class _MentionText extends StatelessWidget {
  const _MentionText(this.text, this.names);
  final String text;
  final List<String> names;
  @override
  Widget build(BuildContext context) {
    if (names.isEmpty) return SelectableText(text);
    final pattern = RegExp(names.map((n) => RegExp.escape('@$n')).join('|'));
    final spans = <TextSpan>[];
    var end = 0;
    for (final match in pattern.allMatches(text)) {
      spans.add(TextSpan(text: text.substring(end, match.start)));
      spans.add(TextSpan(
          text: match.group(0),
          style: const TextStyle(
              color: _accent,
              backgroundColor: _soft,
              fontWeight: FontWeight.w600)));
      end = match.end;
    }
    spans.add(TextSpan(text: text.substring(end)));
    return SelectableText.rich(TextSpan(children: spans));
  }
}

String _agentMarkdown(
    Map<String, dynamic> item, String project, String dashboard) {
  final out = <String>[
    '# ${project.isEmpty ? 'Feedback' : '$project feedback'} #${item['number']} (${item['status']})',
    '',
    ...'${item['body']}'.split('\n').map((l) => '> $l'),
    '— ${item['authorName'] ?? 'Anonymous reviewer'}, ${item['createdAt']}'
  ];
  final comments = _maps(item['comments']);
  if (comments.isNotEmpty) {
    out.addAll(['', '## Replies']);
    for (final c in comments) {
      out.add(
          '- **${c['authorName'] ?? 'Anonymous'}** (${c['createdAt']}): ${c['body']}');
    }
  }
  void section(String title, Map<String, dynamic> values) {
    final entries =
        values.entries.where((e) => e.value != null && '${e.value}'.isNotEmpty);
    if (entries.isEmpty) return;
    out.addAll(
        ['', '## $title', ...entries.map((e) => '- ${e.key}: ${e.value}')]);
  }

  section('Page', {
    'URL': item['url'],
    'Path': item['path'],
    'Title': item['pageTitle'],
    'Viewport':
        '${item['viewportWidth']}×${item['viewportHeight']} @${item['devicePixelRatio'] ?? 1}x',
    'Scroll position': '(${item['scrollX'] ?? 0}, ${item['scrollY'] ?? 0})'
  });
  section('Target', {
    'Click position': item['clickX'] == null
        ? null
        : '(${item['clickX']}, ${item['clickY']})',
    'Selector': item['elementSelector'],
    'XPath': item['elementXpath'],
    'Tag': item['elementTag'],
    'Text': item['elementText'],
    'Bounds': item['elementRect'],
    'Attributes': item['elementAttributes']
  });
  if (item['deployment'] is Map)
    section('Deployment', Map<String, dynamic>.from(item['deployment']));
  if (item['metadata'] is Map && (item['metadata'] as Map).isNotEmpty)
    out.addAll([
      '',
      '## Metadata',
      '```json',
      const JsonEncoder.withIndent('  ').convert(item['metadata']),
      '```'
    ]);
  section('Links & environment', {
    'Screenshot': item['screenshotUrl'],
    'Dashboard': dashboard,
    'User agent': item['userAgent']
  });
  return out.join('\n');
}

// Web widget tokens: 120ms hover; 150ms fade from translateY(4px).
class _Reveal extends StatelessWidget {
  const _Reveal({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    return TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOut,
        child: child,
        builder: (_, value, child) => Opacity(
            opacity: value,
            child: Transform.translate(
                offset: Offset(0, 4 * (1 - value)), child: child)));
  }
}

class _WebCommentIcon extends StatelessWidget {
  const _WebCommentIcon({this.size = 22, this.color = Colors.white});
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
          key: const ValueKey('notette-web-comment'),
          painter: _CommentPainter(color)));
}

class _CommentPainter extends CustomPainter {
  const _CommentPainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    // Exact path from src/widget/components/Icon.svelte, comment.
    final path = Path()
      ..moveTo(21, 11.5)
      ..arcToPoint(const Offset(20.1, 15.3), radius: const Radius.circular(8.4))
      ..arcToPoint(const Offset(12.5, 20), radius: const Radius.circular(8.5))
      ..arcToPoint(const Offset(8.7, 19.1), radius: const Radius.circular(8.4))
      ..lineTo(3, 21)
      ..lineTo(4.9, 15.3)
      ..arcToPoint(const Offset(4, 11.5), radius: const Radius.circular(8.4))
      ..arcToPoint(const Offset(8.7, 3.9), radius: const Radius.circular(8.5))
      ..arcToPoint(const Offset(12.5, 3), radius: const Radius.circular(8.4))
      ..lineTo(13, 3)
      ..arcToPoint(const Offset(21, 11), radius: const Radius.circular(8.5))
      ..lineTo(21, 11.5)
      ..close();
    canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..color = color);
  }

  @override
  bool shouldRepaint(_CommentPainter oldDelegate) => oldDelegate.color != color;
}

class _LauncherButton extends StatefulWidget {
  const _LauncherButton({required this.onPressed});
  final VoidCallback? onPressed;
  @override
  State<_LauncherButton> createState() => _LauncherButtonState();
}

class _LauncherButtonState extends State<_LauncherButton> {
  bool _hovered = false, _pressed = false;
  @override
  Widget build(BuildContext context) {
    final duration = MediaQuery.of(context).disableAnimations
        ? Duration.zero
        : const Duration(milliseconds: 120);
    return MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: Listener(
            onPointerDown: (_) => setState(() => _pressed = true),
            onPointerUp: (_) => setState(() => _pressed = false),
            onPointerCancel: (_) => setState(() => _pressed = false),
            child: AnimatedSlide(
                duration: duration,
                offset: Offset(0, _hovered ? -1 / 48 : 0),
                curve: Curves.easeOut,
                child: AnimatedScale(
                    duration: duration,
                    scale: _pressed ? .96 : 1,
                    curve: Curves.easeOut,
                    child: FloatingActionButton.small(
                      key: const ValueKey('notette-launcher'),
                      heroTag: null,
                      tooltip: 'Send feedback',
                      shape: const CircleBorder(),
                      elevation: 6,
                      hoverElevation: 8,
                      backgroundColor:
                          _hovered ? const Color(0xff4338ca) : _accent,
                      foregroundColor: Colors.white,
                      onPressed: widget.onPressed,
                      child: const _WebCommentIcon(),
                    )))));
  }
}

final _authButtonStyle = FilledButton.styleFrom(
  backgroundColor: _accent,
  foregroundColor: Colors.white,
  minimumSize: const Size(0, 30),
  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
  textStyle: const TextStyle(
      fontFamily: 'Roboto',
      fontSize: 12.5,
      height: 1.3,
      fontWeight: FontWeight.w500),
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
).copyWith(animationDuration: const Duration(milliseconds: 120));
final _authLinkStyle = TextButton.styleFrom(
  foregroundColor: _accent,
  alignment: Alignment.centerLeft,
  padding: EdgeInsets.zero,
  minimumSize: const Size(0, 21),
  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
  textStyle: const TextStyle(fontFamily: 'Roboto', fontSize: 12, height: 1.45),
).copyWith(animationDuration: const Duration(milliseconds: 120));

class _AuthCard extends StatelessWidget {
  const _AuthCard(
      {required this.title,
      required this.child,
      required this.actions,
      required this.onClose,
      required this.alignment});
  final String title;
  final Widget child;
  final List<Widget> actions;
  final VoidCallback onClose;
  final Alignment alignment;
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final margin = media.size.width <= 480 ? 12.0 : 20.0;
    return Semantics(
      namesRoute: true,
      explicitChildNodes: true,
      scopesRoute: true,
      label: title,
      child: AnimatedPadding(
        duration: media.disableAnimations
            ? Duration.zero
            : const Duration(milliseconds: 150),
        curve: Curves.easeOut,
        padding: EdgeInsets.fromLTRB(
            margin, 12, margin, media.viewInsets.bottom + 84),
        child: SafeArea(
            child: Align(
          alignment: alignment,
          child: Container(
            key: const ValueKey('notette-auth-card'),
            width: 340,
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(10),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x2e101828),
                      offset: Offset(0, 12),
                      blurRadius: 40),
                  BoxShadow(
                      color: Color(0x14101828),
                      offset: Offset(0, 2),
                      blurRadius: 8)
                ]),
            child: Material(
              type: MaterialType.transparency,
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(children: [
                          Expanded(
                              child: Text(title,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      height: 1.45,
                                      fontWeight: FontWeight.w700))),
                          SizedBox(
                              width: 28,
                              height: 28,
                              child: IconButton(
                                  tooltip: 'Close',
                                  onPressed: onClose,
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                  icon: const Icon(Icons.close, size: 16))),
                        ]),
                        const SizedBox(height: 10),
                        Flexible(child: SingleChildScrollView(child: child)),
                        if (actions.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Wrap(spacing: 6, children: actions)
                        ],
                      ])),
            ),
          ),
        )),
      ),
    );
  }
}

class _AuthField extends StatefulWidget {
  const _AuthField(this.label,
      {required this.controller,
      required this.enabled,
      this.maxLength,
      this.keyboardType,
      this.obscure = false});
  final String label;
  final TextEditingController controller;
  final bool enabled, obscure;
  final int? maxLength;
  final TextInputType? keyboardType;
  @override
  State<_AuthField> createState() => _AuthFieldState();
}

class _AuthFieldState extends State<_AuthField> {
  final _focus = FocusNode();
  double get _fontSize => defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS
      ? 16
      : 13;
  @override
  void initState() {
    super.initState();
    _focus.addListener(_changed);
  }

  void _changed() => setState(() {});
  @override
  void dispose() {
    _focus.removeListener(_changed);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AnimatedContainer(
          duration: MediaQuery.of(context).disableAnimations
              ? Duration.zero
              : const Duration(milliseconds: 120),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(6),
              boxShadow: [
                if (_focus.hasFocus)
                  const BoxShadow(color: Color(0x334f46e5), spreadRadius: 3)
              ]),
          child: Semantics(
              label: widget.label,
              child: TextField(
                focusNode: _focus,
                controller: widget.controller,
                enabled: widget.enabled,
                obscureText: widget.obscure,
                keyboardType: widget.keyboardType,
                maxLength: widget.maxLength,
                style: TextStyle(
                    fontSize: _fontSize, height: 1.4, color: Color(0xff14181f)),
                autofillHints: widget.obscure
                    ? [
                        widget.label.contains('10')
                            ? AutofillHints.newPassword
                            : AutofillHints.password
                      ]
                    : [
                        widget.keyboardType == TextInputType.emailAddress
                            ? AutofillHints.username
                            : AutofillHints.name
                      ],
                decoration: InputDecoration(
                    hintText: widget.label,
                    counterText: '',
                    filled: true,
                    fillColor: const Color(0xfff4f5f8),
                    hintStyle: TextStyle(
                        color: const Color(0xff8a93a2), fontSize: _fontSize),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: const BorderSide(color: Color(0xffc9cfd8))),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: const BorderSide(color: _accent))),
              ))));
}

class _Resize extends StatelessWidget {
  const _Resize({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => MediaQuery.of(context).disableAnimations
      ? child
      : AnimatedSize(
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: child);
}
