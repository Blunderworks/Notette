# Notette for Flutter

A native Material feedback overlay that sends feedback to your existing self-hosted Notette dashboard. Wrap your app once to show a floating feedback button across routes. Includes optional screenshot previews, reviewer sign-in/sign-out, screen context and custom metadata. No WebView is needed for the feedback UI.

Drag the feedback button with a finger or mouse to move it out of the way; tap or click to open the form. Its position is retained while the overlay is mounted, including across routes and opening/closing the form. It stays within the safe area and adjusts to window resizing, rotation and the keyboard. The position resets when the overlay is recreated or the app restarts.

## Install from this repository

Requires Flutter 3.22+ / Dart 3.4+. This package is not automatically published when the Notette server is released.

In your Flutter app's `pubspec.yaml`, use a local checkout:

```yaml
dependencies:
  flutter:
    sdk: flutter
  notette_flutter:
    path: ../Notette/packages/notette_flutter
```

Or use Git (replace `main` with a reviewed tag or commit for reproducible installs):

```yaml
dependencies:
  notette_flutter:
    git:
      url: https://github.com/Blunderworks/Notette.git
      ref: main
      path: packages/notette_flutter
```

Run `flutter pub get`. Once you have published the package on pub.dev, consumers can instead run `flutter pub add notette_flutter`.

## Configure the server

1. Create a project in Notette and copy its **client key** from the web embed snippet.
2. For native apps, add a logical HTTPS origin such as `https://mobile.example.com` to that project's **Allowed origins**. Use the same origin in `appOrigin`. This identifies the app's feedback URLs; it does not need to serve a website. Native requests explicitly send this Origin header. Origins and client keys are public identifiers, not authentication secrets; native clients can set their own headers.
3. For Flutter web, allow the actual deployed browser origin (and an explicit localhost development origin/port). The browser controls Origin; `appOrigin` is ignored on web, and screen URLs use `Uri.base.origin`.
4. Enable anonymous feedback or add your reviewers as project members. When anonymous feedback is disabled, the overlay requires Notette sign-in. Existing account and email-verification requirements still apply.

No server changes or database migration are needed. Use a server reachable from the device: `localhost` on a phone is the phone itself. Prefer HTTPS for deployed apps.

## Wrap your app

Own a `NotetteClient` for the app's lifetime and close it in `dispose()`. Put the overlay in `MaterialApp.builder` (also works with `MaterialApp.router.builder`), keeping `child` as its child:

```dart
import 'package:flutter/material.dart';
import 'package:notette_flutter/notette_flutter.dart';

final feedbackClient = NotetteClient(
  serverUrl: Uri.parse('https://feedback.example.com'),
  projectKey: 'YOUR_PROJECT_CLIENT_KEY',
  appOrigin: Uri.parse('https://mobile.example.com'),
);

// In your app's build method:
MaterialApp(
  builder: (context, child) => NotetteFeedback(
    client: feedbackClient,
    screenPath: () => '/home', // Read the CURRENT route from your router here.
    screenTitle: () => 'Home',
    metadata: const {'appVersion': '1.0.0', 'environment': 'preview'},
    enabled: true, // Set false to hide the launcher in selected builds.
    screenshots: true, // Enables an unchecked, optional attachment checkbox.
    child: child!,
  ),
  home: const Scaffold(body: Center(child: Text('Your app'))),
);
```

See [example/lib/main.dart](example/lib/main.dart) for a complete example with lifecycle management. To run it, copy that file into a `flutter create` app, add the dependency above, and replace the server/key/origin. The example directory also has a pubspec for analysis; generated platform runners are intentionally omitted.

For multiple screens, connect `screenPath` to your router's current path or to state maintained by a `NavigatorObserver`. The callback is evaluated when feedback opens. Return a root-relative path such as `/settings/profile`; it becomes `https://mobile.example.com/settings/profile` in the dashboard. Native links are logical screen identifiers, not automatically configured deep links. Do not put private data in route query parameters. Viewport dimensions use Flutter logical pixels; the snapshot uses one image pixel per logical pixel. No DOM selector, element pin or scroll offset is inferred for native widgets.

`metadata` must be JSON-encodable and fit the server's 8,000-character limit, with keys of at most 64 characters. Feedback is limited to 5,000 characters. Optional name/email describe anonymous feedback; signed-in authors use their server account identity.

## Screenshots and platform setup

- Screenshots default to off. When enabled, opening the form captures the app subtree into memory before the dialog appears. Nothing is uploaded unless the user selects **Include screenshot** and sends feedback; a preview is shown first. Only use capture on screens appropriate to share. The project must also enable screenshots.
- Flutter platform views, WebViews, video textures and some web renderers may not appear in the image. Capture failures leave text feedback available. Server upload limits still apply. If upload fails after feedback is saved, the UI says so and prevents resubmitting the saved feedback.
- Android: ensure `android/app/src/main/AndroidManifest.xml` includes `<uses-permission android:name="android.permission.INTERNET" />` outside `<application>` for release builds.
- macOS sandboxed builds: add `<key>com.apple.security.network.client</key><true/>` to both DebugProfile and Release entitlements.
- iOS: use HTTPS to work with App Transport Security. Screenshots use Flutter rendering and need no photo-library permission. Windows/Linux use normal network access.
- Web: allow the browser origin in Notette, use HTTPS to avoid mixed-content blocking, and permit your Notette host in the application's CSP `connect-src`.

The package uses portable Flutter and HTTP APIs. Widget tests do not substitute for a device smoke test on each platform you ship.

## Authentication and Turnstile

The overlay supports inline sign-in for existing Notette accounts, with a session held in memory on the client. It does not persist credentials. Sign out revokes the session on the server. Account creation and email confirmation take place outside this package; create/invite members using Notette's dashboard or existing web sign-up flow.

If the instance has Turnstile configured, anonymous submissions and all password sign-ins require a fresh challenge token. Supply `turnstileTokenProvider: (siteKey) async => ...` using your host app's Turnstile integration. It must present a real challenge on a Cloudflare-allowed hostname and return a fresh token for every call (including retries). No Turnstile secret belongs in the app. Without a provider, these actions display a configuration error; the package does not bypass protection. There is no bundled native Turnstile challenge view in this version.

Apps integrating a separate Notette approval flow can set `client.token` to a per-user **widget** session issued for this exact project and origin. Your application's own login token cannot be used. Never ship a shared admin token. Signed-in submissions skip Turnstile, as with the existing web widget. Invalid/expired sessions are re-evaluated by the server; reopen the form to refresh sign-in state.

## Publish to pub.dev

Publishing is a separate maintainer action; these instructions do not publish anything automatically.

1. Confirm you own the package name `notette_flutter` on pub.dev or choose an available name. If renamed, update the pubspec, imports, example and documentation. Check the repository URL, MIT license ownership and release version; update `CHANGELOG.md` for each release.
2. In `packages/notette_flutter`, run:

   ```sh
   flutter pub get
   dart format --output=none --set-exit-if-changed lib test example/lib
   flutter analyze
   flutter test
   flutter pub publish --dry-run
   ```

3. Inspect the dry-run file list and resolve warnings. `.pubignore` excludes caches, builds and local lockfiles. Keep the example, tests, README, changelog and license.
4. Sign in with the Google account or verified publisher that should own this package, then run `flutter pub publish` and review its confirmation. Follow the authentication link if prompted. Published versions are immutable; bump the pubspec version for each new release.
5. After publication, test a fresh app using `flutter pub add notette_flutter` and the setup above.

Flutter dependencies use Flutter/Dart's native pub tooling; the Notette JavaScript server continues to use pnpm. Consult the official [Flutter package guide](https://docs.flutter.dev/packages-and-plugins/developing-packages) and [Dart publishing guide](https://dart.dev/tools/pub/publishing) for publisher setup and release requirements.

This initial package collects feedback. Thread browsing/replies, element picking, admin triage, mentions and sign-up remain available in the web widget/dashboard.
