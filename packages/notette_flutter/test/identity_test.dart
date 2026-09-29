import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:notette_flutter/notette_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A JWT-shaped token; the client only decodes `exp`, the server verifies.
String jwt(String name, {Duration expiresIn = const Duration(hours: 1)}) {
  String segment(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  final exp = DateTime.now().add(expiresIn).millisecondsSinceEpoch ~/ 1000;
  return '${segment({'alg': 'HS256'})}.${segment({
        'sub': name,
        'exp': exp
      })}.sig-$name';
}

Map<String, dynamic> config(
        {bool anonymous = true, Map<String, dynamic>? identity}) =>
    {
      'project': {
        'id': 'p1',
        'anonymousFeedbackAllowed': anonymous,
        'screenshotsEnabled': true
      },
      'viewer': null,
      'identity': identity,
      'turnstileSiteKey': 'site-key',
    };

http.Response json(Object value, [int status = 200]) =>
    http.Response(jsonEncode(value), status);

http.Response identityRejected() => json({
      'error': {
        'message': 'Identity token has expired',
        'code': 'identity_invalid'
      }
    }, 401);

NotetteClient client(MockClient transport,
        {Future<String?> Function()? tokens, String? session}) =>
    NotetteClient(
      serverUrl: Uri.parse('https://feedback.example.com/'),
      projectKey: 'project-key',
      appOrigin: Uri.parse('https://mobile.example.com'),
      httpClient: transport,
      persistSession: false,
      token: session,
      userTokenProvider: tokens,
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('identity token replaces the session and refreshes once when rejected',
      () async {
    final issued = [jwt('stale'), jwt('fresh')];
    var calls = 0;
    final seen = <String?>[];
    final api = client(MockClient((request) async {
      seen.add(request.headers['Authorization']);
      return request.headers['Authorization'] == 'Bearer ${issued[0]}'
          ? identityRejected()
          : json(config(identity: {'id': 'fresh', 'name': 'Jane'}));
    }), session: 'ntw_session', tokens: () async => issued[calls++]);

    final result = await api.config();
    expect(result['identity']['name'], 'Jane');
    expect(seen, ['Bearer ${issued[0]}', 'Bearer ${issued[1]}']);
    expect(calls, 2);
    // Identity failures never discard the stored Notette session.
    expect(api.token, 'ntw_session');
  });

  test('a rejected token falls back to the session until resetIdentity',
      () async {
    final token = jwt('bad');
    var calls = 0;
    final seen = <String?>[];
    final api = client(
        MockClient((request) async {
          seen.add(request.headers['Authorization']);
          return request.headers['Authorization'] == 'Bearer $token'
              ? identityRejected()
              : json(config());
        }),
        session: 'ntw_session',
        tokens: () async {
          calls++;
          return token;
        });

    await expectLater(
        api.config(),
        throwsA(isA<NotetteException>()
            .having((e) => e.code, 'code', 'identity_invalid')));
    expect(api.identityError, 'Identity token has expired');
    await api.config();
    expect(seen.last, 'Bearer ntw_session');
    expect(api.token, 'ntw_session');

    api.resetIdentity();
    await expectLater(api.config(), throwsA(isA<NotetteException>()));
    expect(seen.last, 'Bearer $token');
    expect(calls, 4);
  });

  test('tokens are reused until shortly before they expire', () async {
    var calls = 0;
    var lifetime = const Duration(hours: 1);
    final api =
        client(MockClient((_) async => json(config())), tokens: () async {
      calls++;
      return jwt('user-$calls', expiresIn: lifetime);
    });
    await api.config();
    await api.config();
    expect(calls, 1);

    api.resetIdentity();
    lifetime = const Duration(seconds: 10);
    await api.config();
    await api.config();
    expect(calls, 3);
  });

  testWidgets('standalone dialog sends identified feedback without a pin',
      (tester) async {
    final token = jwt('user-7');
    Map<String, dynamic>? created;
    String? authorization;
    final api = client(MockClient((request) async {
      if (request.url.path.endsWith('/feedback')) {
        created = jsonDecode(request.body) as Map<String, dynamic>;
        authorization = request.headers['Authorization'];
        return json({
          'item': {'id': 'f1', 'number': 3},
          'uploadToken': 'upload'
        }, 201);
      }
      return json(config(
          anonymous: false,
          identity: {'id': 'user-7', 'name': 'Jane Doe', 'email': null}));
    }), tokens: () async => token);

    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showNotetteFeedbackDialog(context,
                        client: api,
                        screenPath: '/settings',
                        screenTitle: 'Settings',
                        metadata: const {'plan': 'pro'}),
                    child: const Text('Give feedback'))))));
    await tester.tap(find.text('Give feedback'));
    await tester.pumpAndSettle();

    expect(find.text('Posting as Jane Doe'), findsOneWidget);
    expect(find.text('Name (optional)'), findsNothing);
    expect(find.widgetWithText(TextButton, 'Sign in'), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'Export is slow');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(authorization, 'Bearer $token');
    expect(created!['body'], 'Export is slow');
    expect(created!.containsKey('click'), isFalse);
    // Verified users skip the bot challenge even though the project has one.
    expect(created!.containsKey('turnstileToken'), isFalse);
    expect(created!['page']['url'], 'https://mobile.example.com/settings');
    expect(created!['page']['title'], 'Settings');
    expect(created!['metadata'], {'framework': 'flutter', 'plan': 'pro'});
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);

    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Feedback sent. Thank you!'), findsNothing);
    expect(find.text('Give feedback'), findsOneWidget);
  });

  testWidgets(
      'app identity without a user on a sign-in-only project explains instead of offering Notette sign-in',
      (tester) async {
    final api = client(MockClient((_) async => json(config(anonymous: false))),
        tokens: () async => null);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showNotetteFeedbackDialog(context,
                        client: api, screenPath: '/settings'),
                    child: const Text('Give feedback'))))));
    await tester.tap(find.text('Give feedback'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to this app to send feedback.'), findsOneWidget);
    expect(find.text('Send'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsNothing);
    await expectLater(
        showNotetteFeedbackDialog(tester.element(find.text('Give feedback')),
            client: api, screenPath: 'settings'),
        throwsArgumentError);
  });

  testWidgets('overlay launcher shows the app user instead of Notette sign-in',
      (tester) async {
    final api = client(
        MockClient((request) async => request.url.path.endsWith('/config')
            ? json(config(
                anonymous: false,
                identity: {'id': 'u1', 'name': 'Jane Doe', 'email': null}))
            : json({'items': [], 'total': 0})),
        tokens: () async => jwt('u1'));
    await tester.pumpWidget(MaterialApp(
        builder: (context, child) => NotetteFeedback(
            client: api,
            screenPath: () => '/settings',
            screenshots: false,
            child: child!),
        home: const Scaffold(body: Text('Host app'))));
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('Comment'), findsOneWidget);
    expect(find.byTooltip('Signed in as Jane Doe'), findsOneWidget);
    expect(find.byTooltip('Sign in'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsNothing);
  });
}
