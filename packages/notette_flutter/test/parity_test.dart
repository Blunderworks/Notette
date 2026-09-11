import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:notette_flutter/notette_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'notette_flutter_test.dart' as helpers;

Map<String, dynamic> configuration(
        {bool admin = true,
        bool signedIn = true,
        bool visible = true,
        bool replies = true}) =>
    {
      'project': {
        'id': 'project',
        'name': 'Preview feedback',
        'publicFeedbackVisible': visible,
        'reviewerRepliesEnabled': replies,
        'anonymousFeedbackAllowed': true,
        'openSignups': true,
        'screenshotsEnabled': true
      },
      'viewer': signedIn
          ? {
              'name': 'Avery Chen',
              'email': 'avery@example.com',
              'admin': admin,
              'emailNotifications': true
            }
          : null,
      'emailEnabled': true,
      'dashboardUrl': 'https://feedback.example.com',
    };
Map<String, dynamic> item(
        {String id = 'note', String status = 'open', String path = '/home'}) =>
    {
      'id': id,
      'number': id == 'note' ? 12 : 13,
      'status': status,
      'body': 'The save button needs a clearer label. @Avery Chen',
      'authorName': 'Sam Rivera',
      'createdAt':
          DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
      'isMember': true,
      'mentions': ['Avery Chen'],
      'commentCount': 1,
      'path': path,
      'url': 'https://mobile.example.com$path',
      'viewportWidth': 800,
      'viewportHeight': 600,
      'clickX': 200,
      'clickY': 200,
      'hasScreenshot': false,
      'comments': [
        {
          'id': 'reply',
          'body': 'Agreed, we can make this clearer.',
          'authorName': 'Avery Chen',
          'isAdmin': true,
          'createdAt': DateTime.now().toIso8601String()
        }
      ],
    };
Future<void> mount(WidgetTester tester, NotetteClient api,
    {NotetteController? controller,
    String Function()? path,
    Future<void> Function(String)? navigate,
    Future<bool> Function(Uri)? openUrl,
    GlobalKey? boundary}) async {
  await tester.pumpWidget(RepaintBoundary(
      key: boundary,
      child: MaterialApp(
        builder: (_, child) => NotetteFeedback(
            client: api,
            controller: controller,
            initiallyOpen: true,
            screenshots: false,
            screenPath: path ?? () => '/home',
            onNavigate: navigate,
            openUrl: openUrl,
            child: child!),
        home: Scaffold(
            backgroundColor: const Color(0xffeef0f5),
            appBar: AppBar(title: const Text('Acme workspace')),
            body:
                const Center(child: Text('Your application stays underneath'))),
      )));
  await tester.pumpAndSettle();
}

Future<void> click(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            SystemChannels.platform, (call) async => null);
  });
  tearDown(() => TestDefaultBinaryMessengerBinding
      .instance.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, null));
  testWidgets(
      'browse, reply, mention, moderation, clipboard and confirmed deletion',
      (tester) async {
    final requests = <http.Request>[];
    var current = item();
    final api = helpers.client(MockClient((request) async {
      requests.add(request);
      final path = request.url.path;
      if (path.endsWith('/config')) return helpers.json(configuration());
      if (path.endsWith('/mentions'))
        return helpers.json({
          'users': [
            {'id': 'avery', 'name': 'Avery Chen', 'admin': true}
          ]
        });
      if (path.endsWith('/comments'))
        return helpers.json({
          'id': 'new',
          'body': jsonDecode(request.body)['body'],
          'authorName': 'Avery Chen'
        });
      if (request.method == 'PATCH') {
        current = {...current, 'status': jsonDecode(request.body)['status']};
        return helpers.json(current);
      }
      if (request.method == 'DELETE') return http.Response('', 204);
      if (path.endsWith('/feedback'))
        return helpers.json({
          'items': [current]
        });
      return helpers.json(current);
    }));
    await mount(tester, api);
    await click(tester, find.text('List'));
    expect(find.text('All pages'), findsOneWidget);
    await click(tester, find.text(current['body'] as String));
    expect(find.text('Agreed, we can make this clearer.'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'Please review @Av');
    await tester.pumpAndSettle();
    await click(tester, find.text('@Avery Chen'));
    await click(tester, find.widgetWithText(FilledButton, 'Reply'));
    final reply = requests.firstWhere((r) => r.url.path.endsWith('/comments'));
    expect(jsonDecode(reply.body)['mentions'], ['avery']);
    expect(find.text('Reply posted.'), findsOneWidget);
    await click(tester, find.text('Resolve'));
    expect(find.text('Reopen'), findsOneWidget);
    await click(tester, find.byTooltip('Copy for agent'));
    expect(find.text('Copied for agent.'), findsOneWidget);
    await click(tester, find.text('Delete feedback'));
    expect(requests.where((r) => r.method == 'DELETE'), isEmpty);
    await click(tester, find.text('Cancel'));
    await click(tester, find.text('Delete feedback'));
    await click(tester, find.text('Delete permanently'));
    expect(requests.where((r) => r.method == 'DELETE').length, 1);
    expect(find.text('Comment'), findsOneWidget);
  });

  testWidgets('reviewer visibility and replies obey project permissions',
      (tester) async {
    var visible = false;
    final controller = NotetteController();
    final requests = <http.Request>[];
    final api = helpers.client(MockClient((r) async {
      requests.add(r);
      if (r.url.path.endsWith('/config'))
        return helpers.json(
            configuration(admin: false, visible: visible, replies: false));
      if (r.url.path.endsWith('/feedback'))
        return helpers.json({
          'items': [item()]
        });
      if (r.url.path.endsWith('/mentions')) return helpers.json({'users': []});
      return helpers.json(item());
    }));
    await mount(tester, api, controller: controller);
    expect(find.text('List'), findsNothing);
    expect(requests.where((r) => r.url.path.endsWith('/feedback')), isEmpty);
    visible = true;
    controller.refresh();
    await tester.pumpAndSettle();
    await click(tester, find.text('List'));
    expect(find.text('All pages'), findsNothing);
    await click(tester, find.text(item()['body'] as String));
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Resolve'), findsNothing);
    expect(find.text('Delete feedback'), findsNothing);
    expect(find.text('Replies are disabled for this project.'), findsOneWidget);
  });

  testWidgets(
      'status filter updates pins and survives remount; route changes reload',
      (tester) async {
    var path = '/home';
    final paths = <String>[];
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(admin: false));
      paths.add(r.url.queryParameters['path'] ?? '');
      return helpers.json({
        'items': [item(), item(id: 'closed', status: 'resolved')]
      });
    }));
    await mount(tester, api, path: () => path);
    expect(find.text('12'), findsOneWidget);
    expect(find.text('13'), findsNothing);
    await click(tester, find.text('List'));
    await click(tester, find.text('Resolved').last);
    await click(tester, find.byTooltip('Close'));
    expect(find.text('12'), findsNothing);
    expect(find.text('13'), findsOneWidget);
    path = '/settings';
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(paths, contains('/settings'));
    await tester.pumpWidget(const SizedBox());
    await mount(tester, api);
    expect(find.text('12'), findsNothing);
    expect(find.text('13'), findsOneWidget);
  });

  testWidgets('signup verification resend and account notification setting',
      (tester) async {
    var signedIn = false;
    final requests = <http.Request>[];
    final api = helpers.client(MockClient((r) async {
      requests.add(r);
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(signedIn: signedIn));
      if (r.url.path.endsWith('/signup'))
        return helpers
            .json({'verificationRequired': true, 'email': 'new@example.com'});
      if (r.url.path.endsWith('/login')) {
        signedIn = true;
        return helpers.json({'token': 'token'});
      }
      if (r.url.path.endsWith('/feedback')) return helpers.json({'items': []});
      if (r.url.path.endsWith('/notifications'))
        return helpers.json({'email': false});
      return helpers.json({});
    }));
    await mount(tester, api);
    await click(tester, find.byTooltip('Sign in'));
    await click(tester, find.text('No account yet? Create one'));
    await tester.enterText(find.byType(TextField).at(0), 'New reviewer');
    await tester.enterText(find.byType(TextField).at(1), 'new@example.com');
    await tester.enterText(find.byType(TextField).at(2), 'long-password');
    await click(tester, find.text('Create account'));
    expect(find.text('Check your inbox'), findsOneWidget);
    await click(tester, find.text('Resend email'));
    expect(
        requests.where((r) => r.url.path.endsWith('/verify/resend')).length, 1);
    await click(tester, find.text('I confirmed it, sign in'));
    await tester.enterText(find.byType(TextField).last, 'long-password');
    await click(tester, find.widgetWithText(FilledButton, 'Sign in'));
    await click(tester, find.byTooltip('Account'));
    await click(tester, find.byType(CheckboxListTile));
    expect(
        jsonDecode(requests
            .lastWhere((r) => r.url.path.endsWith('/notifications'))
            .body),
        {'email': false});
    await click(tester, find.text('Sign out'));
    expect(api.token, isNull);
  });

  testWidgets('dashboard approval rejects late results after cancellation',
      (tester) async {
    final poll = Completer<http.Response>();
    final urls = <Uri>[];
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(signedIn: false));
      if (r.url.path.endsWith('/requests'))
        return helpers.json({
          'authorizeUrl':
              'https://feedback.example.com/widget/authorize?request=id',
          'expiresAt':
              DateTime.now().add(const Duration(minutes: 10)).toIso8601String()
        });
      if (r.url.path.endsWith('/poll')) return poll.future;
      return helpers.json({'items': []});
    }));
    await mount(tester, api, openUrl: (uri) async {
      urls.add(uri);
      return true;
    });
    await click(tester, find.byTooltip('Sign in'));
    await click(tester, find.text('Signed in to the dashboard? Approve there'));
    expect(urls.length, 1);
    await tester.pump(const Duration(seconds: 2));
    await click(tester, find.text('Back to sign in'));
    poll.complete(helpers.json({'status': 'approved', 'token': 'late-token'}));
    await tester.pumpAndSettle();
    expect(api.token, isNull);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('expired write session opens login without losing reply draft',
      (tester) async {
    var expired = false;
    final controller = NotetteController();
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(signedIn: !expired));
      if (r.url.path.endsWith('/comments')) {
        expired = true;
        return helpers.json({
          'error': {'message': 'Session expired'}
        }, 401);
      }
      if (r.url.path.endsWith('/feedback'))
        return helpers.json({
          'items': [item()]
        });
      if (r.url.path.endsWith('/mentions')) return helpers.json({'users': []});
      return helpers.json(item());
    }));
    await mount(tester, api, controller: controller);
    controller.focus('note');
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Keep this reply');
    await click(tester, find.widgetWithText(FilledButton, 'Reply'));
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    await click(tester, find.text('Back'));
    expect(find.text('Keep this reply'), findsOneWidget);
  });

  testWidgets(
      'dashboard approval succeeds even when initial browser launch is blocked',
      (tester) async {
    var signedIn = false;
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(signedIn: signedIn));
      if (r.url.path.endsWith('/requests')) {
        final body = jsonDecode(r.body);
        expect(
            body['id'],
            matches(RegExp(
                r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
        expect((body['pollSecret'] as String).length, 64);
        return helpers.json({
          'authorizeUrl':
              'https://feedback.example.com/widget/authorize?request=id',
          'expiresAt':
              DateTime.now().add(const Duration(minutes: 10)).toIso8601String()
        });
      }
      if (r.url.path.endsWith('/poll')) {
        signedIn = true;
        return helpers.json({'status': 'approved', 'token': 'approved-token'});
      }
      return helpers.json({'items': []});
    }));
    await mount(tester, api, openUrl: (_) async => false);
    await click(tester, find.byTooltip('Sign in'));
    await click(tester, find.text('Signed in to the dashboard? Approve there'));
    expect(find.text('Open approval page'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(api.token, 'approved-token');
    expect(find.byTooltip('Account'), findsOneWidget);
  });

  test('sessions persist for the matching project and clear on logout',
      () async {
    FlutterSecureStorage.setMockInitialValues({});
    NotetteClient make(String key) => NotetteClient(
          serverUrl: Uri.parse('https://feedback.example.com'),
          projectKey: key,
          appOrigin: Uri.parse('https://mobile.example.com'),
          httpClient: MockClient((r) async => r.url.path.endsWith('/login')
              ? helpers.json({'token': 'saved-token'})
              : helpers.json({})),
        );
    final original = make('one');
    await original.login('user@example.com', 'password');
    final restored = make('one');
    await restored.restoreSession();
    expect(restored.token, 'saved-token');
    final otherProject = make('two');
    await otherProject.restoreSession();
    expect(otherProject.token, isNull);
    await restored.logout();
    final loggedOut = make('one');
    await loggedOut.restoreSession();
    expect(loggedOut.token, isNull);
  });

  test('screenshot fetch uses bearer and clears rejected sessions', () async {
    final requests = <http.Request>[];
    var reject = false;
    final api = helpers.client(MockClient((r) async {
      requests.add(r);
      if (reject) return http.Response('', 401);
      return http.Response.bytes([137, 80, 78, 71], 200);
    }))
      ..token = 'session';
    expect(await api.screenshot('note/id'), [137, 80, 78, 71]);
    expect(requests.single.headers['authorization'], 'Bearer session');
    expect(requests.single.headers['origin'], 'https://mobile.example.com');
    reject = true;
    await expectLater(api.screenshot('note'), throwsA(isA<NotetteException>()));
    expect(api.token, isNull);
  });

  testWidgets('keyboard cannot resend saved feedback', (tester) async {
    var posts = 0;
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config'))
        return helpers.json(configuration(signedIn: false));
      if (r.method == 'POST') {
        posts++;
        return helpers.json({
          'item': {'id': 'new'}
        });
      }
      return helpers.json({'items': []});
    }));
    await mount(tester, api);
    await click(tester, find.text('Comment'));
    await tester.tapAt(const Offset(200, 200));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Only once');
    await click(tester, find.text('Send'));
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await tester.pumpAndSettle();
    expect(posts, 1);
  });

  testWidgets(
      'compact layouts render without overflow and export visual previews',
      (tester) async {
    final fontRoot = Platform.environment['FLUTTER_ROOT'];
    if (fontRoot != null) {
      await tester.runAsync(() async {
        for (final entry in {
          'Roboto': 'roboto-regular.ttf',
          'MaterialIcons': 'MaterialIcons-Regular.otf'
        }.entries) {
          final file = File(
              '$fontRoot/bin/cache/artifacts/material_fonts/${entry.value}');
          if (await file.exists()) {
            final loader = FontLoader(entry.key)
              ..addFont(file
                  .readAsBytes()
                  .then((bytes) => ByteData.sublistView(bytes)));
            await loader.load();
          }
        }
      });
    }
    final boundary = GlobalKey();
    final controller = NotetteController();
    final api = helpers.client(MockClient((r) async {
      if (r.url.path.endsWith('/config')) return helpers.json(configuration());
      if (r.url.path.endsWith('/feedback'))
        return helpers.json({
          'items': [item(), item(id: 'closed', status: 'resolved')]
        });
      if (r.url.path.endsWith('/mentions')) return helpers.json({'users': []});
      return helpers.json(item());
    }));
    Future<void> snapshot(String name) async {
      await tester.runAsync(() async {
        final image = await (boundary.currentContext!.findRenderObject()
                as RenderRepaintBoundary)
            .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        final file = File('build/previews/$name.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await mount(tester, api, controller: controller, boundary: boundary);
    await click(tester, find.text('List'));
    await snapshot('desktop-list');
    await click(tester, find.text(item()['body'] as String));
    await snapshot('desktop-thread');
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpAndSettle();
    await snapshot('mobile-thread');
    expect(tester.takeException(), isNull);
    await click(tester, find.text('Close'));
    await click(tester, find.text('Comment'));
    await tester.tapAt(const Offset(150, 200));
    await tester.pumpAndSettle();
    await snapshot('mobile-composer');
    expect(tester.takeException(), isNull);
  });
}
