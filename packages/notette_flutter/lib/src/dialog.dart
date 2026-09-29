part of 'overlay.dart';

/// Shows a standalone feedback dialog, for example from a "Send feedback"
/// item in your settings screen. It needs no [NotetteFeedback] overlay and
/// completes when the dialog closes.
///
/// [screenPath] is the current root-relative route, such as `/settings`. The
/// dialog sends no pin or screenshot. With [NotetteClient.userTokenProvider],
/// feedback is attributed to your signed-in user; otherwise the project's
/// anonymous and sign-in rules apply as in the overlay.
Future<void> showNotetteFeedbackDialog(
  BuildContext context, {
  required NotetteClient client,
  required String screenPath,
  String? screenTitle,
  Map<String, Object?> metadata = const {},
  Map<String, String> deployment = const {},
  Map<String, String> user = const {},
  Future<String> Function(String siteKey)? turnstileTokenProvider,
  Future<bool> Function(Uri url)? openUrl,
}) async {
  if (!screenPath.startsWith('/') ||
      screenPath.startsWith('//') ||
      screenPath.contains('\\')) {
    throw ArgumentError('screenPath must be a root-relative path.');
  }
  final url = Uri.parse(client.origin).resolve(screenPath);
  if (url.origin != client.origin) throw ArgumentError('Invalid screen path.');
  final media = MediaQuery.of(context);
  final page = <String, dynamic>{
    'url': url.toString(),
    if (screenTitle != null) 'title': screenTitle,
    'viewportWidth': media.size.width.round(),
    'viewportHeight': media.size.height.round(),
    'devicePixelRatio': media.devicePixelRatio.clamp(0, 10),
    'userAgent': 'Flutter/${kIsWeb ? 'web' : defaultTargetPlatform.name}',
  };
  // Give a previously rejected identity token another chance each time.
  if (client.identityError != null) client.resetIdentity();
  await client.restoreSession();
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => Theme(
      data: _notetteTheme(),
      child: _FeedbackForm(
        client: client,
        centered: true,
        page: page,
        metadata: metadata,
        deployment: deployment,
        user: user,
        png: null,
        pin: null,
        includeScreenshot: false,
        onScreenshotChanged: (_) {},
        tokenProvider: turnstileTokenProvider,
        openUrl: openUrl,
        onChanged: () {},
        onClose: () => Navigator.of(dialogContext).pop(),
      ),
    ),
  );
}
