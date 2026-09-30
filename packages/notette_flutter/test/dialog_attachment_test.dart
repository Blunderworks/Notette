import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:notette_flutter/notette_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'identity_test.dart' as helpers;

class _FakePicker extends ImagePickerPlatform {
  _FakePicker(this.next);
  XFile? next;
  int calls = 0;

  @override
  Future<XFile?> getImageFromSource(
      {required ImageSource source,
      ImagePickerOptions options = const ImagePickerOptions()}) async {
    calls++;
    return next;
  }
}

final _png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 1, 2]);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> open(WidgetTester tester, NotetteClient api) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showNotetteFeedbackDialog(context,
                        client: api, screenPath: '/settings'),
                    child: const Text('Give feedback'))))));
    await tester.tap(find.text('Give feedback'));
    await tester.pumpAndSettle();
  }

  testWidgets('dialog attaches, clears and uploads a chosen image',
      (tester) async {
    final picker =
        _FakePicker(XFile.fromData(_png, name: 'bug.png', path: 'bug.png'));
    ImagePickerPlatform.instance = picker;
    http.Request? upload;
    final api = helpers.client(MockClient((request) async {
      if (request.url.path.endsWith('/screenshot')) {
        upload = request;
        return helpers.json({'id': 'u1'}, 201);
      }
      if (request.url.path.endsWith('/feedback')) {
        return helpers.json({
          'item': {'id': 'f1', 'number': 3},
          'uploadToken': 'upload'
        }, 201);
      }
      return helpers.json(helpers.config(
          identity: {'id': 'user-7', 'name': 'Jane Doe', 'email': null}));
    }), tokens: () async => helpers.jwt('user-7'));
    await open(tester, api);

    expect(find.text('Include screenshot'), findsNothing);
    await tester.tap(find.text('+ Attach screenshot'));
    await tester.pumpAndSettle();
    expect(find.text('bug.png'), findsOneWidget);
    expect(find.text('+ Attach screenshot'), findsNothing);

    await tester.tap(find.byTooltip('Remove screenshot'));
    await tester.pumpAndSettle();
    expect(find.text('bug.png'), findsNothing);
    await tester.tap(find.text('+ Attach screenshot'));
    await tester.pumpAndSettle();
    expect(picker.calls, 2);

    await tester.enterText(find.byType(TextField).first, 'Export is slow');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(upload!.method, 'PUT');
    expect(upload!.url.path, endsWith('/feedback/f1/screenshot'));
    expect(upload!.headers['Content-Type'], 'image/png');
    expect(upload!.headers['X-Notette-Upload-Token'], 'upload');
    expect(upload!.bodyBytes, _png);
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);
  });

  testWidgets('dialog rejects unsupported images and sends without one',
      (tester) async {
    ImagePickerPlatform.instance = _FakePicker(XFile.fromData(
        Uint8List.fromList(utf8.encode('GIF89a')),
        name: 'anim.gif'));
    var uploads = 0;
    final api = helpers.client(MockClient((request) async {
      if (request.url.path.endsWith('/screenshot')) uploads++;
      if (request.url.path.endsWith('/feedback')) {
        return helpers.json({
          'item': {'id': 'f1', 'number': 3},
          'uploadToken': 'upload'
        }, 201);
      }
      return helpers.json(helpers.config(
          identity: {'id': 'user-7', 'name': 'Jane Doe', 'email': null}));
    }), tokens: () async => helpers.jwt('user-7'));
    await open(tester, api);

    await tester.tap(find.text('+ Attach screenshot'));
    await tester.pumpAndSettle();
    expect(find.text('Choose a PNG, JPEG or WebP image.'), findsOneWidget);
    expect(find.text('anim.gif'), findsNothing);

    await tester.enterText(find.byType(TextField).first, 'Export is slow');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(uploads, 0);
    expect(find.text('Feedback sent. Thank you!'), findsOneWidget);
  });

  testWidgets('dialog rejects images over the server upload limit',
      (tester) async {
    final big = Uint8List(1024 * 1024 + 1)..setAll(0, _png);
    ImagePickerPlatform.instance =
        _FakePicker(XFile.fromData(big, name: 'big.png', path: 'big.png'));
    final api = helpers.client(MockClient((request) async {
      final config = helpers.config(
          identity: {'id': 'user-7', 'name': 'Jane Doe', 'email': null});
      config['project']['maxScreenshotBytes'] = 1024 * 1024;
      return helpers.json(config);
    }), tokens: () async => helpers.jwt('user-7'));
    await open(tester, api);

    await tester.tap(find.text('+ Attach screenshot'));
    await tester.pumpAndSettle();
    expect(find.text('Choose an image under 1 MB.'), findsOneWidget);
    expect(find.text('big.png'), findsNothing);
  });
}
