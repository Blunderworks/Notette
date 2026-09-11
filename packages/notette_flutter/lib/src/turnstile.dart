import 'dart:async';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Internal seam for testing lifecycle behavior without a platform WebView.
@visibleForTesting
Widget Function(CloudflareTurnstile view)? debugTurnstileViewBuilder;

/// One on-demand verification. Tokens are delivered immediately, never cached.
class TurnstileChallenge extends StatefulWidget {
  const TurnstileChallenge({
    super.key,
    required this.siteKey,
    required this.origin,
    required this.action,
    required this.onToken,
    required this.onCancel,
    this.provider,
  });

  final String siteKey;
  final String origin;
  final String action;
  final ValueChanged<String> onToken;
  final VoidCallback onCancel;
  final Future<String> Function(String)? provider;

  @override
  State<TurnstileChallenge> createState() => _TurnstileChallengeState();
}

class _TurnstileChallengeState extends State<TurnstileChallenge> {
  Timer? _timer;
  int _generation = 0;
  bool _finished = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    final generation = ++_generation;
    _error = null;
    _timer?.cancel();
    _timer = Timer(const Duration(minutes: 2), () {
      _fail(generation,
          'Verification timed out. Check your connection and retry.');
    });
    final provider = widget.provider;
    if (provider != null) {
      Future<String>.sync(() => provider(widget.siteKey)).then(
        (token) => _receive(generation, token),
        onError: (Object error) =>
            _fail(generation, 'Could not complete verification. Please retry.'),
      );
    }
  }

  bool _active(int generation) =>
      mounted && !_finished && _error == null && generation == _generation;

  void _receive(int generation, String token) {
    if (!_active(generation)) return;
    if (token.trim().isEmpty || token.length > 2048) {
      _fail(
          generation, 'Verification returned an invalid token. Please retry.');
      return;
    }
    _finished = true;
    _timer?.cancel();
    widget.onToken(token);
  }

  void _fail(int generation, String message) {
    if (!_active(generation)) return;
    _timer?.cancel();
    setState(() => _error = message);
  }

  void _cancel() {
    _finished = true;
    _timer?.cancel();
    widget.onCancel();
  }

  @override
  void dispose() {
    _finished = true;
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final generation = _generation;
    final supported = kIsWeb ||
        {
          TargetPlatform.android,
          TargetPlatform.iOS,
          TargetPlatform.macOS,
          TargetPlatform.windows
        }.contains(defaultTargetPlatform);
    Widget? view;
    if (_error == null &&
        widget.provider == null &&
        (supported || debugTurnstileViewBuilder != null)) {
      final turnstile = CloudflareTurnstile(
        key: ValueKey(generation),
        siteKey: widget.siteKey,
        baseUrl: '${widget.origin}/',
        action: widget.action,
        options: TurnstileOptions(
          size: TurnstileSize.compact,
          retryAutomatically: false,
          refreshExpired: TurnstileRefreshExpired.manual,
          refreshTimeout: TurnstileRefreshTimeout.manual,
        ),
        onTokenReceived: (token) => _receive(generation, token),
        onTokenExpired: () => _fail(generation,
            'Verification expired. Please retry for a fresh challenge.'),
        onTimeout: () => _fail(generation,
            'Verification timed out. Check your connection and retry.'),
        onError: (error) => _fail(
            generation,
            error.code.toString().startsWith('1102')
                ? 'This hostname (${Uri.parse(widget.origin).host}) is not allowed in Cloudflare Turnstile (error ${error.code}). Ask the project admin to add it.'
                : 'Verification could not load (Turnstile error ${error.code}). Check your connection and retry.'),
      );
      view = debugTurnstileViewBuilder?.call(turnstile) ?? turnstile;
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Verify to continue'),
        const SizedBox(height: 12),
        if (_error != null)
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error))
        else if (view != null)
          Center(child: view)
        else if (widget.provider != null) ...[
          const Text('Waiting for verification…'),
          const LinearProgressIndicator(),
        ] else
          const Text(
              'Built-in verification is not supported on this platform. Contact the app developer to configure a Turnstile provider.'),
        Wrap(
          spacing: 8,
          children: [
            if (_error != null)
              TextButton(
                  onPressed: () => setState(_start),
                  child: const Text('Retry verification')),
            TextButton(
                onPressed: _cancel, child: const Text('Cancel verification')),
          ],
        ),
      ],
    );
  }
}
