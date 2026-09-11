import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:notette_flutter/notette_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'notette_flutter_test.dart' as helpers;
import 'parity_test.dart' as fixtures;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  Future<void> mount(WidgetTester tester,
      {bool signedIn = false,
      bool reducedMotion = false,
      GlobalKey? boundary}) async {
    final api = helpers.client(MockClient((request) async {
      if (request.url.path.endsWith('/config'))
        return helpers.json(fixtures.configuration(signedIn: signedIn));
      return helpers.json({'items': []});
    }));
    await tester.pumpWidget(RepaintBoundary(
        key: boundary,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: ThemeData(fontFamily: 'Roboto'),
          builder: (_, child) => MediaQuery(
              data: MediaQuery.of(_).copyWith(disableAnimations: reducedMotion),
              child: NotetteFeedback(
                  client: api,
                  screenshots: false,
                  screenPath: () => '/home',
                  child: child!)),
          home: const Scaffold(
              backgroundColor: Color(0xfff4f5f8),
              body: Center(child: Text('Host application'))),
        )));
    await tester.pumpAndSettle();
  }

  testWidgets(
      'launcher is a 48px circle and signed-out taps open compact sign-in',
      (tester) async {
    await mount(tester);
    final launcher = find.byType(FloatingActionButton);
    expect(tester.getSize(launcher), const Size(48, 48));
    expect(tester.widget<FloatingActionButton>(launcher).shape,
        isA<CircleBorder>());
    expect(
        find.descendant(
            of: launcher,
            matching: find.byKey(const ValueKey('notette-web-comment'))),
        findsOneWidget);
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    expect(find.text('Comment'), findsNothing);
    final card = find.byKey(const ValueKey('notette-auth-card'));
    expect(card, findsOneWidget);
    final rect = tester.getRect(card);
    expect(rect.width, 340);
    expect(rect.right, 780);
    expect(rect.bottom, 516);
    final signIn = find.widgetWithText(FilledButton, 'Sign in');
    expect(tester.getSize(signIn).width, 314);
    expect(find.byType(TextField), findsNWidgets(2));
    for (final field in tester.widgetList<TextField>(find.byType(TextField))) {
      expect(field.decoration!.labelText, isNull);
      expect(field.decoration!.hintText, isNotNull);
      expect(field.decoration!.filled, true);
    }
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(card, findsNothing);
    expect(find.text('Comment'), findsNothing);
    expect(launcher, findsOneWidget);
  });

  testWidgets('signed-in launcher opens toolbar and hover uses web accent',
      (tester) async {
    await mount(tester, signedIn: true);
    final launcher = find.byType(FloatingActionButton);
    final mouse = await tester.createGesture(kind: ui.PointerDeviceKind.mouse);
    await mouse.addPointer(location: const Offset(0, 0));
    await mouse.moveTo(tester.getCenter(launcher));
    await tester.pumpAndSettle();
    expect(tester.widget<FloatingActionButton>(launcher).backgroundColor,
        const Color(0xff4338ca));
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    expect(find.text('Comment'), findsOneWidget);
    expect(find.byKey(const ValueKey('notette-auth-card')), findsNothing);
    await mouse.removePointer();
  });

  testWidgets('action bar anchors, stacks, and stays movable during placement',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 600);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await mount(tester, signedIn: true);
    final launcher = find.byType(FloatingActionButton);
    final origin = tester.getBottomRight(launcher);
    await tester.tap(launcher);
    await tester.pumpAndSettle();
    final bar = find.byKey(const ValueKey('notette-action-bar'));
    expect(tester.getBottomRight(bar), origin);
    expect(tester.getSize(bar).height, lessThan(70));
    final comment = find.widgetWithText(OutlinedButton, 'Comment');
    final style = tester.widget<OutlinedButton>(comment).style!;
    expect(style.shape!.resolve({}), isA<StadiumBorder>());
    expect(style.foregroundColor!.resolve({}), const Color(0xff14181f));
    expect(
        find.descendant(
            of: comment,
            matching: find.byKey(const ValueKey('notette-web-comment'))),
        findsOneWidget);
    await tester.dragFrom(
        tester.getTopLeft(bar) + const Offset(12, 3), const Offset(-100, -100));
    await tester.pumpAndSettle();
    final moved = tester.getBottomRight(bar);
    expect(moved.dx, lessThan(origin.dx - 50));
    expect(moved.dy, lessThan(origin.dy - 50));
    await tester.tap(find.text('Comment'));
    await tester.pumpAndSettle();
    expect(tester.getBottomRight(bar), moved);
    expect(tester.getSize(bar).height, lessThan(80));
    expect(find.text('Tap anywhere to place a pin'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    await tester.dragFrom(
        tester.getTopLeft(bar) + const Offset(12, 3), const Offset(-60, -50));
    await tester.pumpAndSettle();
    expect(tester.getBottomRight(bar).dy, lessThan(moved.dy - 20));
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    tester.view.physicalSize = const Size(320, 480);
    await tester.pumpAndSettle();
    final commentRect = tester.getRect(find.text('Comment'));
    final pinsRect = tester.getRect(find.text('Pins 0'));
    final listRect = tester.getRect(find.text('List'));
    expect(commentRect.bottom, lessThan(pinsRect.top));
    expect(pinsRect.bottom, lessThan(listRect.top));
    expect(tester.getCenter(find.byTooltip('Account')).dy,
        tester.getCenter(find.byTooltip('Close feedback toolbar')).dy);
    await tester.dragFrom(
        tester.getTopLeft(bar) + const Offset(12, 3), const Offset(2000, 2000));
    await tester.pumpAndSettle();
    expect(tester.getRect(bar).right, lessThanOrEqualTo(308));
    expect(tester.getRect(bar).bottom, lessThanOrEqualTo(468));
    await tester.tap(find.byTooltip('Close feedback toolbar'));
    await tester.pump(const Duration(milliseconds: 75));
    final animated =
        find.ancestor(of: launcher, matching: find.byType(AnimatedSize));
    expect(tester.getSize(animated).height, greaterThan(48));
    await tester.pumpAndSettle();
    expect(tester.getSize(launcher), const Size(48, 48));
    expect(tester.takeException(), isNull);
  });

  testWidgets('auth entrance fades for 150ms and reduced motion skips it',
      (tester) async {
    await mount(tester);
    await tester.tap(find.byType(FloatingActionButton));
    final card = find.byKey(const ValueKey('notette-auth-card'));
    for (var i = 0; i < 10 && card.evaluate().isEmpty; i++) {
      await tester.pump();
    }
    final opacity =
        find.ancestor(of: card, matching: find.byType(Opacity)).first;
    expect(tester.widget<Opacity>(opacity).opacity, 0);
    await tester.pump(const Duration(milliseconds: 75));
    expect(tester.widget<Opacity>(opacity).opacity, inExclusiveRange(0, 1));
    await tester.pumpAndSettle();
    expect(tester.widget<Opacity>(opacity).opacity, 1);
    await tester.pumpWidget(const SizedBox());
    await mount(tester, reducedMotion: true);
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(
        find.ancestor(of: card, matching: find.byType(Opacity)), findsNothing);
  });

  testWidgets(
      'auth desktop and mobile layouts render without keyboard overflow',
      (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    final oldShadows = debugDisableShadows;
    debugDisableShadows = false;
    addTearDown(() => debugDisableShadows = oldShadows);
    final root = Platform.environment['FLUTTER_ROOT'];
    if (root != null)
      await tester.runAsync(() async {
        for (final font in {
          'Roboto': 'roboto-regular.ttf',
          'MaterialIcons': 'MaterialIcons-Regular.otf'
        }.entries) {
          final file =
              File('$root/bin/cache/artifacts/material_fonts/${font.value}');
          if (await file.exists())
            await (FontLoader(font.key)
                  ..addFont(file
                      .readAsBytes()
                      .then((bytes) => ByteData.sublistView(bytes))))
                .load();
        }
      });
    final boundary = GlobalKey();
    Future<void> snapshot(String name) async {
      await tester.runAsync(() async {
        final image = await (boundary.currentContext!.findRenderObject()
                as RenderRepaintBoundary)
            .toImage();
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        final file = File('build/previews/$name.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(data!.buffer.asUint8List());
        image.dispose();
      });
    }

    await mount(tester, boundary: boundary);
    await snapshot('launcher-circle');
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await snapshot('desktop-sign-in');
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await snapshot('mobile-sign-in');
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.enterText(
        find.byType(TextField).first, 'reviewer@example.com');
    await tester.pumpAndSettle();
    await snapshot('mobile-sign-in-keyboard');
    expect(tester.takeException(), isNull);
    debugDisableShadows = oldShadows;
    debugDefaultTargetPlatformOverride = null;
  });
}
