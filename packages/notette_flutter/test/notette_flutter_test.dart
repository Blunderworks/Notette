import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
      persistSession: false,
    );
Future<void> open(WidgetTester tester, NotetteClient api,
    {bool screenshots = false}) async {
  await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
            client: api,
            initiallyOpen: true,
            screenPath: () => '/settings',
            screenshots: screenshots,
            child: child!,
          ),
      home: const Scaffold(body: Text('Host app'))));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Comment'));
  await tester.pumpAndSettle();
  await tester.tapAt(const Offset(200, 200));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => debugTurnstileViewBuilder = null);
  testWidgets(
      'drag moves launcher without opening feedback; tap still opens it',
      (tester) async {
    var requests = 0;
    final api = client(MockClient((_) async {
      requests++;
      return json(config(signedIn: true));
    }));
    var hostTaps = 0;
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api,
          screenPath: () => '/home',
          screenshots: false,
          child: child!),
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
    await tester.tap(find.text('Comment'));
    await tester.pumpAndSettle();
    expect(requests, 1);
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tapAt(tester.getCenter(find.text('Host action')));
    await tester.pumpAndSettle();
    expect(hostTaps, 1);
    expect(requests, 3);
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Close feedback toolbar'));
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
    final api = client(MockClient((_) async => json(config(signedIn: true))));
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api,
          screenPath: () => '/home',
          screenshots: false,
          child: child!),
      home: const Scaffold(),
    ));
    final launcher = find.byType(FloatingActionButton);
    await tester.drag(launcher, const Offset(-2000, -2000));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(launcher), const Offset(20, 20));
    await tester.drag(launcher, const Offset(2000, 2000));
    await tester.pumpAndSettle();
    expect(tester.getBottomRight(launcher), const Offset(780, 580));
    tester.view.physicalSize = const Size(320, 480);
    tester.view.viewInsets = const FakeViewPadding(bottom: 160);
    tester.view.viewPadding = const FakeViewPadding(top: 30);
    await tester.pumpAndSettle();
    final rect = tester.getRect(launcher);
    expect(rect.right, lessThanOrEqualTo(308));
    expect(rect.bottom, lessThanOrEqualTo(308));
    expect(rect.top, greaterThanOrEqualTo(30));
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Comment'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(150, 150));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
  });

  testWidgets('pin placement can be cancelled without opening a form',
      (tester) async {
    var requests = 0;
    final api = client(MockClient((_) async {
      requests++;
      return json(config());
    }));
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => NotetteFeedback(
          client: api,
          initiallyOpen: true,
          screenPath: () => '/home',
          screenshots: false,
          child: child!),
      home: const Scaffold(),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Comment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(requests, 1);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Comment'), findsOneWidget);
  });

  testWidgets('screenshot choice survives closing and remounting',
      (tester) async {
    var uploads = 0;
    final api = client(MockClient((request) async {
      if (request.method == 'GET') return json(config());
      if (request.method == 'PUT') uploads++;
      return json({
        'item': {'id': 'item'},
        'uploadToken': 'upload'
      });
    }));
    Future<void> showForm() async {
      await tester.pumpWidget(MaterialApp(
        builder: (context, child) => NotetteFeedback(
            client: api,
            initiallyOpen: true,
            screenPath: () => '/home',
            child: child!),
        home: const Scaffold(body: Text('Capture me')),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Comment'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tapAt(const Offset(200, 200));
        await Future<void>.delayed(const Duration(milliseconds: 500));
      });
      await tester.pumpAndSettle();
    }

    await showForm();
    final checkbox = find.byType(CheckboxListTile);
    expect(tester.widget<CheckboxListTile>(checkbox).value, true);
    await tester.ensureVisible(checkbox);
    await tester.tap(checkbox);
    await tester.pumpAndSettle();
    expect(tester.widget<CheckboxListTile>(checkbox).value, false);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await showForm();
    expect(tester.widget<CheckboxListTile>(checkbox).value, false);
    expect(find.byType(Image), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'Without screenshot');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(uploads, 0);
  });

  testWidgets('all feedback and login labels stay above filled inputs',
      (tester) async {
    final api = client(MockClient((_) async => json(config())));
    await open(tester, api);
    Future<void> checkFields(List<String> labels,
        {bool external = true}) async {
      for (var i = 0; i < labels.length; i++) {
        final field = find.byType(TextField).at(i);
        await tester.ensureVisible(field);
        await tester.enterText(field, 'Some text');
        await tester.pumpAndSettle();
        expect(tester.widget<TextField>(field).decoration!.filled, true);
        if (!external) {
          expect(tester.widget<TextField>(field).decoration!.labelText, isNull);
          continue;
        }
        expect(tester.getBottomLeft(find.text(labels[i])).dy,
            lessThan(tester.getTopLeft(field).dy));
      }
    }

    await checkFields(
        ['What could be better?', 'Name (optional)', 'Email (optional)']);
    await tester.ensureVisible(find.text('Sign in').last);
    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();
    await checkFields(['Email', 'Password'], external: false);
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
    expect(payload!['click'], {'x': 200.0, 'y': 200.0});
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
    await tester.tap(find.text('Sign in').last);
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
          initiallyOpen: true,
          screenPath: () => '/home',
          screenshots: true,
          child: child!),
      home: const Scaffold(body: Text('Screenshot content')),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Comment'));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tapAt(const Offset(200, 200));
      // RenderRepaintBoundary image encoding runs outside the fake test clock.
      await Future<void>.delayed(const Duration(milliseconds: 500));
    });
    await tester.pumpAndSettle();
    expect(find.byType(CheckboxListTile), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        true);
    expect(uploads, 0);
    await tester.enterText(find.byType(TextField).first, 'Screenshot feedback');
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
