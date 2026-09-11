import 'dart:async';
import 'dart:convert';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:notette_flutter/notette_flutter.dart';
import 'package:notette_flutter/src/turnstile.dart';

import 'notette_flutter_test.dart' as helpers;

void main() {
  late CloudflareTurnstile view;
  setUp(() {
    debugTurnstileViewBuilder = (widget) {
      view = widget;
      return const SizedBox(width: 150, height: 140, child: Text('Challenge'));
    };
  });
  tearDown(() => debugTurnstileViewBuilder = null);

  Future<void> send(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField).first, 'Keep my draft');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
  }

  testWidgets('automatically presents challenge and sends exactly once',
      (tester) async {
    final payloads = <Map<String, dynamic>>[];
    final api = helpers.client(MockClient((request) async {
      if (request.method == 'GET')
        return helpers.json(helpers.config(siteKey: 'site-key'));
      payloads.add(jsonDecode(request.body) as Map<String, dynamic>);
      return helpers.json({
        'item': {'id': 'item'}
      });
    }));
    await helpers.open(tester, api);
    await send(tester);
    expect(view.siteKey, 'site-key');
    expect(view.baseUrl, 'https://mobile.example.com/');
    expect(view.action, 'feedback');
    expect(payloads, isEmpty);
    view.onTokenReceived!('fresh-token');
    view.onTokenReceived!('duplicate-callback');
    await tester.pumpAndSettle();
    expect(payloads.single['turnstileToken'], 'fresh-token');
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);
  });

  testWidgets('login gets a token; authenticated feedback skips it',
      (tester) async {
    var signedIn = false;
    final payloads = <Map<String, dynamic>>[];
    final api = helpers.client(MockClient((request) async {
      if (request.method == 'GET')
        return helpers.json(helpers.config(
            anonymous: false, signedIn: signedIn, siteKey: 'site-key'));
      payloads.add(jsonDecode(request.body) as Map<String, dynamic>);
      if (request.url.path.endsWith('/auth/login')) {
        signedIn = true;
        return helpers.json({'token': 'ntw_session'});
      }
      return helpers.json({
        'item': {'id': 'item'}
      });
    }));
    await helpers.open(tester, api);
    await tester.enterText(
        find.byType(TextField).first, 'reviewer@example.com');
    await tester.enterText(find.byType(TextField).last, 'password');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(view.action, 'login');
    view.onTokenReceived!('login-token');
    await tester.pumpAndSettle();
    await send(tester);
    expect(payloads.first['turnstileToken'], 'login-token');
    expect(payloads.last.containsKey('turnstileToken'), false);
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);
  });

  testWidgets('rejected token refreshes site key and retries only once',
      (tester) async {
    var posts = 0;
    final tokens = <String>[];
    final api = helpers.client(MockClient((request) async {
      if (request.method == 'GET')
        return helpers.json(
            helpers.config(siteKey: posts == 0 ? 'site-key' : 'rotated-key'));
      posts++;
      tokens.add(jsonDecode(request.body)['turnstileToken'] as String);
      return helpers.json({
        'error': {'message': 'Verification failed', 'code': 'turnstile_failed'}
      }, 400);
    }));
    await helpers.open(tester, api);
    await send(tester);
    view.onTokenReceived!('first');
    await tester.pumpAndSettle();
    expect(view.siteKey, 'rotated-key');
    view.onTokenReceived!('second');
    await tester.pumpAndSettle();
    expect(posts, 2);
    expect(tokens, ['first', 'second']);
    expect(find.text('Verification failed'), findsOneWidget);
    expect(find.text('Keep my draft'), findsOneWidget);
    expect(find.text('Verify to continue'), findsNothing);
  });

  for (final code in ['rate_limited', 'turnstile_unavailable']) {
    testWidgets(
        '$code does not automatically replay; manual retry uses fresh token',
        (tester) async {
      final tokens = <String>[];
      final api = helpers.client(MockClient((request) async {
        if (request.method == 'GET')
          return helpers.json(helpers.config(siteKey: 'site-key'));
        tokens.add(jsonDecode(request.body)['turnstileToken'] as String);
        return helpers.json({
          'error': {'message': 'Try later', 'code': code}
        }, 503);
      }));
      await helpers.open(tester, api);
      await send(tester);
      view.onTokenReceived!('first');
      await tester.pumpAndSettle();
      expect(tokens, ['first']);
      expect(find.text('Keep my draft'), findsOneWidget);
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
      view.onTokenReceived!('second');
      await tester.pumpAndSettle();
      expect(tokens, ['first', 'second']);
    });
  }

  testWidgets('errors, expiry and timeout allow retry and ignore old callbacks',
      (tester) async {
    final received = <String>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TurnstileChallenge(
      siteKey: 'key',
      origin: 'https://mobile.example.com',
      action: 'feedback',
      onToken: received.add,
      onCancel: () {},
    ))));
    final old = view;
    view.onError!(const TurnstileException('Hostname', code: 110200));
    await tester.pumpAndSettle();
    expect(find.textContaining('mobile.example.com'), findsOneWidget);
    await tester.tap(find.text('Retry verification'));
    await tester.pumpAndSettle();
    old.onTokenReceived!('stale');
    expect(received, isEmpty);
    view.onTokenExpired!();
    await tester.pumpAndSettle();
    expect(find.textContaining('expired'), findsOneWidget);
    await tester.tap(find.text('Retry verification'));
    await tester.pumpAndSettle();
    view.onTimeout!();
    await tester.pumpAndSettle();
    expect(find.textContaining('timed out'), findsOneWidget);
    await tester.tap(find.text('Retry verification'));
    await tester.pumpAndSettle();
    view.onTokenReceived!('fresh');
    expect(received, ['fresh']);
  });

  testWidgets('cancel and unmount cannot submit a late token', (tester) async {
    var posts = 0;
    final api = helpers.client(MockClient((request) async {
      if (request.method == 'POST') posts++;
      return helpers.json(helpers.config(siteKey: 'site-key'));
    }));
    await helpers.open(tester, api);
    await send(tester);
    final cancelled = view;
    await tester.tap(find.text('Cancel verification'));
    await tester.pumpAndSettle();
    cancelled.onTokenReceived!('late');
    expect(find.text('Keep my draft'), findsOneWidget);
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    final unmounted = view;
    await tester.pumpWidget(const SizedBox());
    unmounted.onTokenReceived!('late-again');
    await tester.pumpAndSettle();
    expect(posts, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'optional provider overrides built-in view and retries invalid tokens',
      (tester) async {
    var calls = 0;
    var embedded = 0;
    debugTurnstileViewBuilder = (_) {
      embedded++;
      return const SizedBox();
    };
    final tokens = <String>[];
    final api = helpers.client(MockClient((request) async {
      if (request.method == 'GET')
        return helpers.json(helpers.config(siteKey: 'site-key'));
      tokens.add(jsonDecode(request.body)['turnstileToken'] as String);
      return helpers.json({
        'item': {'id': 'item'}
      });
    }));
    await tester.pumpWidget(MaterialApp(
      builder: (_, child) => NotetteFeedback(
          client: api,
          screenPath: () => '/',
          turnstileTokenProvider: (key) async {
            expect(key, 'site-key');
            calls++;
            return calls == 1 ? '' : 'override-token';
          },
          child: child!),
      home: const Scaffold(),
    ));
    await tester.tap(find.byTooltip('Send feedback'));
    await tester.pumpAndSettle();
    await send(tester);
    expect(tokens, isEmpty);
    expect(find.textContaining('invalid token'), findsOneWidget);
    await tester.tap(find.text('Retry verification'));
    await tester.pumpAndSettle();
    expect(tokens, ['override-token']);
    expect(embedded, 0);
  });

  testWidgets('hung provider times out and late completion is ignored',
      (tester) async {
    final pending = Completer<String>();
    final tokens = <String>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TurnstileChallenge(
      siteKey: 'key',
      origin: 'https://mobile.example.com',
      action: 'feedback',
      provider: (_) => pending.future,
      onToken: tokens.add,
      onCancel: () {},
    ))));
    await tester.pump(const Duration(minutes: 2));
    await tester.pumpAndSettle();
    expect(find.textContaining('timed out'), findsOneWidget);
    pending.complete('late');
    await tester.pumpAndSettle();
    expect(tokens, isEmpty);
  });
}
