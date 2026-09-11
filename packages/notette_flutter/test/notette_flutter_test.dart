import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:notette_flutter/src/turnstile.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:notette_flutter/notette_flutter.dart';

Map<String, dynamic> config(
        {bool anonymous = true, bool signedIn = false, String? siteKey}) =>
    {
      'project': {
        'anonymousFeedbackAllowed': anonymous,
        'screenshotsEnabled': true
      },
      'viewer': signedIn ? {'name': 'Reviewer'} : null,
      'turnstileSiteKey': siteKey,
    };
http.Response json(Object value, [int status = 200]) =>
    http.Response(jsonEncode(value), status);
NotetteClient client(MockClient transport) => NotetteClient(
      serverUrl: Uri.parse('https://feedback.example.com/'),
      projectKey: 'project-key',
      appOrigin: Uri.parse('https://mobile.example.com'),
      httpClient: transport,
    );
Future<void> open(WidgetTester tester, NotetteClient api,
    {bool screenshots = false}) async {
  await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
            client: api,
            screenPath: () => '/settings',
            screenshots: screenshots,
            child: child!,
          ),
      home: const Scaffold(body: Text('Host app'))));
  await tester.tap(find.byTooltip('Send feedback'));
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => debugTurnstileViewBuilder = null);
  testWidgets(
      'drag moves launcher without opening feedback; tap still opens it',
      (tester) async {
    var requests = 0;
    final api = client(MockClient((_) async {
      requests++;
      return json(config());
    }));
    var hostTaps = 0;
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api, screenPath: () => '/home', child: child!),
      home: Scaffold(
          body: Center(
              child: TextButton(
                  onPressed: () => hostTaps++,
                  child: const Text('Host action')))),
    ));
    final launcher = find.byType(FloatingActionButton);
    final initial = tester.getCenter(launcher);
    await tester.drag(launcher, const Offset(-200, -150));
    await tester.pumpAndSettle();
    final moved = tester.getCenter(launcher);
    expect(moved.dx, lessThan(initial.dx - 100));
    expect(moved.dy, lessThan(initial.dy - 75));
    expect(requests, 0);
    await tester.tap(find.text('Host action'));
    expect(hostTaps, 1);
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    expect(requests, 1);
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    expect(tester.getCenter(launcher), moved);
  });

  testWidgets(
      'drag clamps to safe area and remains reachable after resizing and keyboard',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 600);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetViewInsets);
    addTearDown(tester.view.resetViewPadding);
    final api = client(MockClient((_) async => json(config())));
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api, screenPath: () => '/home', child: child!),
      home: const Scaffold(),
    ));
    final launcher = find.byType(FloatingActionButton);
    await tester.drag(launcher, const Offset(-2000, -2000));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(launcher), const Offset(16, 16));
    await tester.drag(launcher, const Offset(2000, 2000));
    await tester.pumpAndSettle();
    expect(tester.getBottomRight(launcher), const Offset(784, 584));
    tester.view.physicalSize = const Size(320, 480);
    tester.view.viewInsets = const FakeViewPadding(bottom: 160);
    tester.view.viewPadding = const FakeViewPadding(top: 30);
    await tester.pumpAndSettle();
    final rect = tester.getRect(launcher);
    expect(rect.right, lessThanOrEqualTo(304));
    expect(rect.bottom, lessThanOrEqualTo(304));
    expect(rect.top, greaterThanOrEqualTo(30));
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
  });

  test('sends origin, scoped bearer and raw screenshot upload token', () async {
    final requests = <http.Request>[];
    final api = client(MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/auth/login'))
        return json({'token': 'ntw_session'});
      return json({});
    }));
    await api.login('reviewer@example.com', 'password');
    await api.uploadScreenshot(
        'item', 'ntu_upload', Uint8List.fromList([1, 2, 3]));
    expect(requests.first.headers['origin'], 'https://mobile.example.com');
    expect(requests.last.headers['authorization'], 'Bearer ntw_session');
    expect(requests.last.headers['x-notette-upload-token'], 'ntu_upload');
    expect(requests.last.bodyBytes, [1, 2, 3]);
    await api.logout();
    expect(api.token, isNull);
  });

  test('preserves server error codes', () async {
    final api = client(MockClient((_) async => json({
          'error': {'message': 'Slow down', 'code': 'rate_limited'}
        }, 429)));
    await expectLater(
        api.config(),
        throwsA(isA<NotetteException>()
            .having((e) => e.status, 'status', 429)
            .having((e) => e.code, 'code', 'rate_limited')));
  });

  testWidgets(
      'submits dashboard-compatible page context and closes without losing host',
      (tester) async {
    Map<String, dynamic>? payload;
    final api = client(MockClient((request) async {
      if (request.method == 'GET') return json(config());
      payload = jsonDecode(request.body) as Map<String, dynamic>;
      return json({
        'item': {'id': 'item'},
        'uploadToken': null
      }, 201);
    }));
    await open(tester, api);
    await tester.enterText(
        find.byType(TextField).first, 'Improve the settings');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(payload!['page']['url'], 'https://mobile.example.com/settings');
    expect(payload!['page'].containsKey('title'), false);
    expect(payload!['body'], 'Improve the settings');
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Host app'), findsOneWidget);
  });

  testWidgets('requires login and then submits under the returned session',
      (tester) async {
    var signedIn = false;
    final api = client(MockClient((request) async {
      if (request.method == 'GET')
        return json(config(anonymous: false, signedIn: signedIn));
      signedIn = true;
      return json({'token': 'ntw_session'});
    }));
    await open(tester, api);
    expect(find.text('What could be better?'), findsNothing);
    await tester.enterText(
        find.byType(TextField).first, 'reviewer@example.com');
    await tester.enterText(find.byType(TextField).last, 'password');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(api.token, 'ntw_session');
    expect(find.text('What could be better?'), findsOneWidget);
  });

  testWidgets('keeps draft on API rejection', (tester) async {
    final api = client(MockClient((request) async => request.method == 'GET'
        ? json(config())
        : json({
            'error': {'message': 'Slow down', 'code': 'rate_limited'}
          }, 429)));
    await open(tester, api);
    await tester.enterText(find.byType(TextField).first, 'My draft');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(find.text('Slow down'), findsOneWidget);
    expect(find.text('My draft'), findsOneWidget);
  });

  testWidgets('does not bypass required bot verification', (tester) async {
    debugTurnstileViewBuilder = (_) => const Text('Challenge placeholder');
    var posts = 0;
    final api = client(MockClient((request) async {
      if (request.method == 'POST') posts++;
      return json(config(siteKey: 'site-key'));
    }));
    await open(tester, api);
    await tester.enterText(find.byType(TextField).first, 'My feedback');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(posts, 0);
    expect(find.text('Verify to continue'), findsOneWidget);
    await tester.tap(find.text('Cancel verification'));
    await tester.pumpAndSettle();
    expect(find.text('My feedback'), findsOneWidget);
  });

  testWidgets(
      'screenshot failure reports saved feedback without a resend button',
      (tester) async {
    var created = 0;
    var uploads = 0;
    final api = client(MockClient((request) async {
      if (request.method == 'GET') return json(config());
      if (request.method == 'PUT') {
        uploads++;
        expect(request.headers['x-notette-upload-token'], 'ntu_upload');
        expect(request.bodyBytes.take(4), [137, 80, 78, 71]);
        return json({
          'error': {'message': 'Upload failed'}
        }, 500);
      }
      created++;
      return json({
        'item': {'id': 'item'},
        'uploadToken': 'ntu_upload'
      }, 201);
    }));
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api,
          screenPath: () => '/home',
          screenshots: true,
          child: child!),
      home: const Scaffold(body: Text('Screenshot content')),
    ));
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Send feedback'));
      // RenderRepaintBoundary image encoding runs outside the fake test clock.
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(find.byType(CheckboxListTile), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        false);
    expect(uploads, 0);
    await tester.enterText(find.byType(TextField).first, 'Screenshot feedback');
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(created, 1);
    expect(uploads, 1);
    expect(
        find.text('Feedback sent, but the screenshot could not be uploaded.'),
        findsOneWidget);
    expect(find.text('Send'), findsNothing);
  });
}
