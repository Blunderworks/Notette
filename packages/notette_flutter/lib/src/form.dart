part of 'overlay.dart';

class _FeedbackForm extends StatefulWidget {
  const _FeedbackForm(
      {super.key,
      this.authOnly = false,
      this.alignment = Alignment.bottomRight,
      this.detailId,
      this.user = const {},
      this.deployment = const {},
      this.openUrl,
      this.onNavigate,
      required this.onChanged,
      required this.client,
      required this.page,
      required this.metadata,
      required this.png,
      required this.pin,
      required this.includeScreenshot,
      required this.onScreenshotChanged,
      required this.tokenProvider,
      required this.onClose});
  final bool authOnly;
  final Alignment alignment;
  final String? detailId;
  final Map<String, String> user, deployment;
  final Future<bool> Function(Uri)? openUrl;
  final Future<void> Function(String)? onNavigate;
  final VoidCallback onChanged;
  final NotetteClient client;
  final Map<String, dynamic> page;
  final Map<String, Object?> metadata;
  final Uint8List? png;
  final Offset pin;
  final bool includeScreenshot;
  final ValueChanged<bool> onScreenshotChanged;
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
  late bool _attach;
  bool _signIn = false;
  bool _signup = false;
  bool _unverified = false;
  String? _verifyEmail;
  String? _notice;
  Map<String, dynamic>? _detail;
  Uint8List? _shot;
  String? _shotError;
  bool _shotExpanded = false;
  bool _deleteConfirm = false;
  List<Map<String, dynamic>> _candidates = [];
  List<String> _mentions = [];
  String? _approvalStatus;
  String? _approvalUrl;
  Timer? _pollTimer;
  int _authGeneration = 0;
  bool get _admin => _config?['viewer']?['admin'] == true;
  bool get _canSee =>
      _admin ||
      (_config?['project']?['publicFeedbackVisible'] == true &&
          !_requiresLogin);
  bool get _canReply =>
      _admin ||
      (_canSee && _config?['project']?['reviewerRepliesEnabled'] == true);
  String get _dashboardLink =>
      '${_config?['dashboardUrl'] ?? widget.client.dashboardBase}/projects/${_config?['project']?['id']}/feedback/${widget.detailId}';
  Completer<String?>? _verification;
  Widget? _challengeView;
  bool get _signedIn => _config?['viewer'] != null;
  bool get _requiresLogin =>
      _config?['project']['anonymousFeedbackAllowed'] == false && !_signedIn;

  @override
  void initState() {
    super.initState();
    _attach = widget.includeScreenshot;
    _signIn = widget.authOnly;
    _name.text = widget.user['name'] ?? '';
    _email.text = widget.user['email'] ?? '';
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _authGeneration++;
    final verification = _verification;
    if (verification != null && !verification.isCompleted)
      verification.complete(null);
    for (final controller in [_body, _name, _email, _password]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted)
        setState(() {
          _error = '$e';
          if (e is NotetteException && e.status == 401) {
            _signIn = true;
            _config?['viewer'] = null;
            _candidates = [];
            widget.onChanged();
          }
          if (e is NotetteException && e.code == 'email_unverified')
            _unverified = true;
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() => _run(() async {
        final config = await widget.client.config();
        if (!mounted) return;
        setState(() => _config = config);
        try {
          final prefs = await SharedPreferences.getInstance();
          if (mounted) {
            if (_name.text.isEmpty)
              _name.text = prefs.getString('notette:author:name') ?? '';
            if (_email.text.isEmpty)
              _email.text = prefs.getString('notette:author:email') ?? '';
          }
        } catch (_) {}
        await _loadCandidates();
        if (widget.detailId != null && _canSee) await _loadDetail();
      });

  Future<void> _refreshConfig() async {
    final config = await widget.client.config();
    if (!mounted) throw const NotetteException('Verification cancelled.');
    if (config['viewer'] == null && widget.client.token != null) {
      widget.client.token = null;
      await widget.client.saveSession();
    }
    if (!mounted) throw const NotetteException('Verification cancelled.');
    setState(() => _config = config);
  }

  Future<String?> _challenge(String action) async {
    final key = _config?['turnstileSiteKey'] as String?;
    if (key == null || key.isEmpty) return null;
    if (!mounted) throw const NotetteException('Verification cancelled.');
    final pending = Completer<String?>();
    _verification = pending;
    setState(() => _challengeView = TurnstileChallenge(
          key: UniqueKey(),
          siteKey: key,
          origin: widget.client.origin,
          action: action,
          provider: widget.tokenProvider,
          onToken: (token) {
            if (!pending.isCompleted) pending.complete(token);
          },
          onCancel: () {
            if (!pending.isCompleted) pending.complete(null);
          },
        ));
    try {
      final token = await pending.future;
      if (!mounted || token == null)
        throw const NotetteException(
            'Verification cancelled. Your draft has been kept.');
      return token;
    } finally {
      _verification = null;
      if (mounted) setState(() => _challengeView = null);
    }
  }

  // Only a definitive Turnstile rejection is safe to automatically replay.
  // Network failures may have saved feedback already; never replay those.
  Future<T> _verified<T>(String action, Future<T> Function(String?) send,
      {bool anonymousOnly = false}) async {
    for (var attempt = 0;; attempt++) {
      await _refreshConfig();
      if (anonymousOnly && _requiresLogin) {
        throw const NotetteException(
            'Please sign in to send your feedback. Your draft has been kept.');
      }
      final token =
          anonymousOnly && _signedIn ? null : await _challenge(action);
      if (!mounted) throw const NotetteException('Verification cancelled.');
      try {
        return await send(token);
      } on NotetteException catch (error) {
        if (error.code != 'turnstile_failed' || attempt >= 1) rethrow;
      }
    }
  }

  Future<void> _loadCandidates() async {
    if (!_signedIn) {
      _candidates = [];
      return;
    }
    try {
      final result = await widget.client.mentions();
      if (mounted && _signedIn)
        setState(() => _candidates = _maps(result['users']));
    } catch (_) {/* Mention lookup must not block feedback. */}
  }

  Future<void> _loadDetail() async {
    final item = await widget.client.detail(widget.detailId!);
    if (!mounted) return;
    setState(() => _detail = item);
    if (item['hasScreenshot'] == true) await _loadShot();
  }

  Future<void> _loadShot() async {
    try {
      final bytes = await widget.client.screenshot(widget.detailId!);
      if (mounted)
        setState(() {
          _shot = bytes;
          _shotError = null;
        });
    } catch (e) {
      if (mounted) setState(() => _shotError = '$e');
    }
  }

  Future<void> _saveAuthor() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('notette:author:name', _name.text.trim());
      await prefs.setString('notette:author:email', _email.text.trim());
    } catch (_) {}
  }

  Future<void> _signedInSuccessfully() async {
    _password.clear();
    final config = await widget.client.config();
    if (!mounted) return;
    setState(() {
      _config = config;
      _signIn = false;
      _signup = false;
      _approvalStatus = null;
      _verifyEmail = null;
    });
    widget.onChanged();
    if (widget.authOnly) {
      widget.onClose();
      return;
    }
    await _loadCandidates();
    if (widget.detailId != null && _canSee) await _loadDetail();
  }

  Future<void> _login() => _run(() async {
        _unverified = false;
        if (_email.text.trim().isEmpty || _password.text.isEmpty)
          throw const NotetteException('Enter your email and password.');
        if (_signup) {
          if (_name.text.trim().isEmpty || _password.text.length < 10)
            throw const NotetteException(
                'Enter your name and a password of at least 10 characters.');
          final result = await _verified(
              'signup',
              (token) => widget.client.signup(
                  _name.text, _email.text, _password.text,
                  turnstileToken: token));
          if (!mounted) return;
          if (result['verificationRequired'] == true) {
            _password.clear();
            setState(() => _verifyEmail =
                result['email'] as String? ?? _email.text.trim());
            return;
          }
        } else {
          await _verified(
              'login',
              (token) => widget.client
                  .login(_email.text, _password.text, turnstileToken: token));
        }
        if (mounted) await _signedInSuccessfully();
      });
  Future<void> _resend() => _run(() async {
        await widget.client.resendVerification(_verifyEmail ?? _email.text);
        if (mounted)
          setState(
              () => _notice = 'Confirmation email sent. Check your inbox.');
      });

  void _cancelApproval() {
    _pollTimer?.cancel();
    _authGeneration++;
    setState(() {
      _approvalStatus = null;
      _approvalUrl = null;
    });
  }

  Future<void> _approve() => _run(() async {
        final generation = ++_authGeneration;
        _pollTimer?.cancel();
        final random = math.Random.secure();
        final bytes = List<int>.generate(16, (_) => random.nextInt(256));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        final hex =
            bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
        final id =
            '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
        final secret = List.generate(32,
                (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'))
            .join();
        final result = await widget.client.createAuthRequest(id, secret);
        if (!mounted || generation != _authGeneration) return;
        final url = result['authorizeUrl'] as String;
        final uri = Uri.parse(url);
        if (uri.origin != Uri.parse(widget.client.dashboardBase).origin)
          throw const NotetteException('Invalid approval URL.');
        setState(() {
          _approvalUrl = url;
          _approvalStatus = 'waiting';
        });
        try {
          await _launch(url, widget.openUrl);
        } catch (_) {
          if (mounted && generation == _authGeneration)
            setState(() => _approvalStatus = 'blocked');
        }
        final deadline = DateTime.tryParse('${result['expiresAt']}') ??
            DateTime.now().add(const Duration(minutes: 10));
        void schedule() {
          if (!mounted || generation != _authGeneration) return;
          _pollTimer = Timer(const Duration(milliseconds: 1500), () async {
            if (!mounted || generation != _authGeneration) return;
            if (DateTime.now().isAfter(deadline)) {
              setState(() => _approvalStatus = 'expired');
              return;
            }
            try {
              final response = await widget.client.pollAuthRequest(id, secret);
              if (!mounted || generation != _authGeneration) return;
              final status = response['status'];
              if (status == 'approved' && response['token'] is String) {
                widget.client.token = response['token'] as String;
                await widget.client.saveSession();
                if (!mounted || generation != _authGeneration) return;
                await _run(_signedInSuccessfully);
                return;
              }
              if (status == 'denied' || status == 'expired') {
                setState(() => _approvalStatus = status as String);
                return;
              }
            } on NotetteException catch (e) {
              if (!mounted || generation != _authGeneration) return;
              if (e.status == 404) {
                setState(() => _approvalStatus = 'expired');
                return;
              }
            } catch (_) {/* Retry reads until expiry, never replay a write. */}
            schedule();
          });
        }

        schedule();
      });

  Future<void> _moderate() => _run(() async {
        await _refreshConfig();
        if (!_admin)
          throw const NotetteException('Administrator access is required.');
        final result = await widget.client.setStatus(widget.detailId!,
            _detail!['status'] == 'open' ? 'resolved' : 'open');
        if (mounted) setState(() => _detail = result);
        widget.onChanged();
      });
  Future<void> _delete() => _run(() async {
        await _refreshConfig();
        if (!_admin)
          throw const NotetteException('Administrator access is required.');
        await widget.client.remove(widget.detailId!);
        if (!mounted) return;
        widget.onChanged();
        widget.onClose();
      });

  Future<void> _submit() => _run(() async {
        if (_body.text.trim().isEmpty)
          throw const NotetteException('Please enter your feedback.');
        if (widget.detailId != null) {
          final comment = await _verified('reply', (token) {
            if (!_canReply)
              throw const NotetteException(
                  'Replies are not enabled for your account.');
            return widget.client.reply(widget.detailId!, {
              'body': _body.text.trim(),
              'author': {
                'name': _name.text.trim(),
                'email': _email.text.trim()
              },
              if (_signedIn) 'mentions': _mentions,
              if (token != null) 'turnstileToken': token,
            });
          }, anonymousOnly: true);
          if (!mounted) return;
          setState(() {
            _detail?['comments'] = [..._maps(_detail?['comments']), comment];
            _notice = 'Reply posted.';
          });
          _body.clear();
          _mentions = [];
          await _saveAuthor();
          widget.onChanged();
          return;
        }
        final result = await _verified(
            'feedback',
            (token) => widget.client.createFeedback({
                  'body': _body.text.trim(),
                  'page': widget.page,
                  'click': {
                    'x': widget.pin.dx.round(),
                    'y': widget.pin.dy.round()
                  },
                  if (widget.deployment.isNotEmpty)
                    'deployment': widget.deployment,
                  if (_signedIn) 'mentions': _mentions,
                  'author': {
                    'name': _name.text.trim(),
                    'email': _email.text.trim()
                  },
                  'metadata': {'framework': 'flutter', ...widget.metadata},
                  if (token != null) 'turnstileToken': token,
                }),
            anonymousOnly: true);
        var message = 'Feedback sent. Thank you!';
        if (_attach &&
            _config?['project']['screenshotsEnabled'] == true &&
            widget.png != null &&
            result['uploadToken'] != null) {
          try {
            await widget.client.uploadScreenshot(result['item']['id'] as String,
                result['uploadToken'] as String, widget.png!);
          } catch (_) {
            message =
                'Feedback sent, but the screenshot could not be uploaded.';
          }
        }
        if (mounted) setState(() => _success = message);
        await _saveAuthor();
        widget.onChanged();
      });

  @override
  Widget build(BuildContext context) {
    final login = _requiresLogin || _signIn;
    final thread = widget.detailId != null;
    final title = _success != null
        ? 'Thank you'
        : _verifyEmail != null
            ? 'Check your inbox'
            : login
                ? (_signup ? 'Create an account' : 'Sign in')
                : thread
                    ? 'Feedback #${_detail?['number'] ?? '…'}'
                    : 'Send feedback';
    return CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.enter, control: true): () {
            if (!_busy &&
                _config != null &&
                _success == null &&
                _verifyEmail == null &&
                _approvalStatus == null &&
                _challengeView == null) {
              if (login) {
                _login();
              } else if (!thread || _canReply) {
                _submit();
              }
            }
          },
          const SingleActivator(LogicalKeyboardKey.enter, meta: true): () {
            if (!_busy &&
                _config != null &&
                _success == null &&
                _verifyEmail == null &&
                _approvalStatus == null &&
                _challengeView == null) {
              if (login) {
                _login();
              } else if (!thread || _canReply) {
                _submit();
              }
            }
          },
        },
        child: _Card(
            title: title,
            auth: login || _verifyEmail != null || _approvalStatus != null,
            alignment: widget.alignment,
            onClose: widget.onClose,
            child: _Resize(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                  if (_challengeView != null)
                    _challengeView!
                  else if (_success != null) ...[
                    const Icon(Icons.check_circle_outline,
                        size: 36, color: Color(0xff16a34a)),
                    const SizedBox(height: 12),
                    Text(_success!),
                  ] else if (_verifyEmail != null) ...[
                    Text(
                        'We sent a confirmation link to $_verifyEmail. Open it to activate your account, then sign in here.'),
                    TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _verifyEmail = null;
                                  _signup = false;
                                }),
                        child: const Text('I confirmed it, sign in')),
                    TextButton(
                        onPressed: _busy ? null : _resend,
                        child: const Text('Resend email')),
                  ] else if (_approvalStatus != null) ...[
                    Text(switch (_approvalStatus) {
                      'waiting' =>
                        'Approve the request in your browser. This window will update automatically.',
                      'blocked' =>
                        'Open the approval page, approve the request, then return here.',
                      'denied' => 'The request was denied.',
                      'expired' => 'The sign-in request expired. Try again.',
                      _ => 'Sign-in could not be completed.'
                    }),
                    if (_approvalStatus == 'waiting' ||
                        _approvalStatus == 'blocked') ...[
                      TextButton(
                          onPressed: () => _run(
                              () => _launch(_approvalUrl!, widget.openUrl)),
                          child: const Text('Open approval page')),
                      SelectableText(_approvalUrl ?? '',
                          style: const TextStyle(fontSize: 11, color: _muted)),
                    ] else
                      TextButton(
                          onPressed: _busy ? null : _approve,
                          child: const Text('Try again')),
                    TextButton(
                        onPressed: _cancelApproval,
                        child: const Text('Back to sign in')),
                  ] else if (_config != null) ...[
                    if (login) ...[
                      if (_requiresLogin)
                        const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: Text(
                                'Sign in to leave feedback on this site.',
                                style: TextStyle(color: _muted))),
                      if (_signup)
                        _AuthField('Your name',
                            controller: _name, enabled: !_busy, maxLength: 120),
                      _AuthField('Email',
                          controller: _email,
                          enabled: !_busy,
                          maxLength: 254,
                          keyboardType: TextInputType.emailAddress),
                      _AuthField(
                          _signup
                              ? 'Password (at least 10 characters)'
                              : 'Password',
                          controller: _password,
                          enabled: !_busy,
                          obscure: true,
                          maxLength: 200),
                      if (_unverified)
                        TextButton(
                            style: _authLinkStyle,
                            onPressed: _busy ? null : _resend,
                            child: const Text('Resend confirmation email')),
                      const SizedBox(height: 2),
                      SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _login,
                            style: _authButtonStyle,
                            child: Text(_busy
                                ? (_signup
                                    ? 'Creating account…'
                                    : 'Signing in…')
                                : (_signup ? 'Create account' : 'Sign in')),
                          )),
                      const SizedBox(height: 10),
                      if (_config?['project']?['openSignups'] == true)
                        TextButton(
                            style: _authLinkStyle,
                            onPressed: _busy
                                ? null
                                : () => setState(() {
                                      _signup = !_signup;
                                      _error = null;
                                      _unverified = false;
                                    }),
                            child: Text(_signup
                                ? 'Already have an account? Sign in'
                                : 'No account yet? Create one')),
                      TextButton(
                          style: _authLinkStyle,
                          onPressed: _busy ? null : _approve,
                          child: const Text(
                              'Signed in to the dashboard? Approve there')),
                    ] else ...[
                      if (thread && !_canSee)
                        const Text('Feedback is not visible to your account.')
                      else ...[
                        if (thread && _detail != null) ...[
                          Wrap(
                              spacing: 6,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                _StatusNumber(_detail!),
                                Text(
                                    _detail!['status'] == 'resolved'
                                        ? 'Resolved'
                                        : 'Open',
                                    style: const TextStyle(
                                        fontSize: 12, color: _muted)),
                                IconButton(
                                    tooltip: 'Copy for agent',
                                    onPressed: () => _run(() async {
                                          await Clipboard.setData(ClipboardData(
                                              text: _agentMarkdown(
                                                  _detail!,
                                                  '${_config?['project']?['name'] ?? ''}',
                                                  _dashboardLink)));
                                          if (mounted)
                                            setState(() =>
                                                _notice = 'Copied for agent.');
                                        }),
                                    icon: const Icon(Icons.copy, size: 16)),
                                if (_admin)
                                  IconButton(
                                      tooltip: 'Open in dashboard',
                                      onPressed: () => _run(() => _launch(
                                          _dashboardLink, widget.openUrl)),
                                      icon: const Icon(Icons.open_in_new,
                                          size: 16)),
                                IconButton(
                                    tooltip: 'Refresh thread',
                                    onPressed:
                                        _busy ? null : () => _run(_loadDetail),
                                    icon: const Icon(Icons.refresh, size: 16)),
                              ]),
                          if (_detail?['path'] != null)
                            Row(children: [
                              Expanded(
                                  child: Text('${_detail!['path']}',
                                      style: const TextStyle(
                                          color: _muted, fontSize: 11))),
                              if (widget.onNavigate != null)
                                TextButton(
                                    onPressed: () => _run(() async {
                                          await widget.onNavigate!(
                                              _detail!['path'] as String);
                                          if (mounted) widget.onClose();
                                        }),
                                    child: const Text('Go to screen'))
                            ]),
                          _message(_detail!, root: true),
                          if (_detail?['elementTag'] != null)
                            Text(
                                '<${_detail!['elementTag']}> ${_detail!['elementText'] ?? ''}',
                                style: const TextStyle(
                                    fontSize: 11, color: _muted)),
                          if (_shot != null) ...[
                            TextButton.icon(
                                onPressed: () => setState(
                                    () => _shotExpanded = !_shotExpanded),
                                icon:
                                    const Icon(Icons.image_outlined, size: 16),
                                label: Text(_shotExpanded
                                    ? 'Collapse screenshot'
                                    : 'Expand screenshot')),
                            SizedBox(
                                height: _shotExpanded ? 300 : 100,
                                child: InteractiveViewer(
                                    minScale: 1,
                                    maxScale: 5,
                                    child: Image.memory(_shot!,
                                        fit: BoxFit.contain))),
                            const SizedBox(height: 12),
                          ],
                          if (_shotError != null)
                            TextButton(
                                onPressed: () => _run(_loadShot),
                                child: const Text(
                                    'Screenshot unavailable · Retry')),
                          ..._maps(_detail!['comments'])
                              .map((c) => _message(c)),
                          if (_admin)
                            Wrap(spacing: 6, children: [
                              TextButton.icon(
                                  onPressed: _busy ? null : _moderate,
                                  icon: Icon(
                                      _detail!['status'] == 'open'
                                          ? Icons.check
                                          : Icons.refresh,
                                      size: 16),
                                  label: Text(_detail!['status'] == 'open'
                                      ? 'Resolve'
                                      : 'Reopen')),
                              TextButton.icon(
                                  onPressed: _busy
                                      ? null
                                      : () =>
                                          setState(() => _deleteConfirm = true),
                                  icon: const Icon(Icons.delete_outline,
                                      size: 16),
                                  label: const Text('Delete feedback')),
                            ]),
                          if (_deleteConfirm)
                            Container(
                                padding: const EdgeInsets.all(12),
                                color: const Color(0xfffef2f2),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Text(
                                          'Delete feedback #${_detail!['number']}? Its replies and screenshot will be permanently deleted.'),
                                      Wrap(children: [
                                        TextButton(
                                            onPressed: _busy
                                                ? null
                                                : () => setState(() =>
                                                    _deleteConfirm = false),
                                            child: const Text('Cancel')),
                                        FilledButton(
                                            onPressed: _busy ? null : _delete,
                                            child: const Text(
                                                'Delete permanently'))
                                      ]),
                                    ])),
                        ],
                        if (!thread || (_detail != null && _canReply)) ...[
                          _MentionEditor(
                              controller: _body,
                              candidates: _candidates,
                              onMentions: (ids) => _mentions = ids,
                              enabled: !_busy,
                              label:
                                  thread ? 'Reply' : 'What could be better?'),
                          if (_candidates.isNotEmpty)
                            const Padding(
                                padding: EdgeInsets.only(bottom: 8),
                                child: Text('Type @ to mention someone',
                                    style: TextStyle(
                                        fontSize: 11, color: _muted))),
                          if (!_signedIn) ...[
                            _Field('Name (optional)',
                                controller: _name,
                                enabled: !_busy,
                                maxLength: 120),
                            _Field('Email (optional)',
                                controller: _email,
                                enabled: !_busy,
                                maxLength: 254,
                                keyboardType: TextInputType.emailAddress),
                            TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => setState(() => _signIn = true),
                                child: const Text('Sign in')),
                          ] else
                            Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Text(
                                    'Posting as ${_config?['viewer']?['name'] ?? 'Reviewer'}',
                                    style: const TextStyle(
                                        color: _muted, fontSize: 12))),
                          if (!thread &&
                              widget.png != null &&
                              _config?['project']?['screenshotsEnabled'] ==
                                  true) ...[
                            CheckboxListTile(
                                contentPadding: EdgeInsets.zero,
                                title: const Text('Include screenshot'),
                                value: _attach,
                                onChanged: _busy
                                    ? null
                                    : (v) {
                                        setState(() => _attach = v!);
                                        widget.onScreenshotChanged(v!);
                                      }),
                            if (_attach)
                              ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: Image.memory(widget.png!,
                                      height: 140, fit: BoxFit.contain)),
                          ],
                        ] else if (thread && _detail != null)
                          const Text('Replies are disabled for this project.',
                              style: TextStyle(color: _muted)),
                      ],
                    ],
                  ],
                  if (_busy && _challengeView == null)
                    const LinearProgressIndicator(),
                  if (_notice != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_notice!,
                            style: const TextStyle(color: Color(0xff16a34a)))),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_error!,
                            style: const TextStyle(color: Colors.red))),
                ])),
            actions: [
              if (!login && _verifyEmail == null && _approvalStatus == null)
                TextButton(
                    onPressed: widget.onClose, child: const Text('Close')),
              if (_signIn &&
                  !widget.authOnly &&
                  !_requiresLogin &&
                  _success == null)
                TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                              _signIn = false;
                              _signup = false;
                            }),
                    child: const Text('Back')),
              if (!login &&
                  _success == null &&
                  _verifyEmail == null &&
                  _approvalStatus == null &&
                  _challengeView == null &&
                  (!thread || login || _canReply || _config == null))
                FilledButton(
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
                            ? (_signup ? 'Create account' : 'Sign in')
                            : thread
                                ? 'Reply'
                                : 'Send')),
            ]));
  }
}
