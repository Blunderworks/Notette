# Notette for Flutter

A native Material feedback overlay that sends feedback to your existing self-hosted Notette dashboard. Wrap your app once to show a floating feedback button across routes. Includes the web widget's compact indigo toolbar and cards, feedback pins, searchable lists, threads, moderation, mentions and account flows.

Drag the feedback button with a finger or mouse to move it out of the way; tap or click to open the form. Its position is retained while the overlay is mounted, including across routes and opening/closing the form. It stays within the safe area and adjusts to window resizing, rotation and the keyboard. The position resets when the overlay is recreated or the app restarts.

## Install from this repository

Requires Flutter 3.24+ / Dart 3.5+.

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

Run `flutter pub get`.

## Configure the server

1. Create a project in Notette and copy its **client key** from the web embed snippet.
2. For native apps, add a logical HTTPS origin such as `https://mobile.example.com` to that project's **Allowed origins**. Use the same origin in `appOrigin`. This identifies the app's feedback URLs; it does not need to serve a website. Client keys are public identifiers; require sign-in to restrict who can leave feedback.
3. For Flutter web, allow the actual deployed browser origin (and an explicit localhost development origin/port). On web, the browser address is used instead of `appOrigin`.
4. Enable anonymous feedback or add your reviewers as project members. When anonymous feedback is disabled, the overlay requires Notette sign-in. Existing account and email-verification requirements still apply.

Use a server reachable from the device: `localhost` on a phone is the phone itself. Prefer HTTPS for deployed apps.

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
    screenshots: true, // Default; users can uncheck Include screenshot.
    child: child!,
  ),
  home: const Scaffold(body: Center(child: Text('Your app'))),
);
```

See [example/lib/main.dart](example/lib/main.dart) for a complete example with lifecycle management. To run it, copy that file into a `flutter create` app, add the dependency above, and replace the server/key/origin.

For multiple screens, connect `screenPath` to your router's current path or to state maintained by a `NavigatorObserver`. Tap the circular feedback button to sign in (or expand the toolbar if already signed in), choose **Comment**, then tap the screen to place a pin and open the form. Cancel exits pin placement. The callback is evaluated when the pin is placed. Return a root-relative path such as `/settings/profile`; it becomes `https://mobile.example.com/settings/profile` in the dashboard. Native links are logical screen identifiers, not automatically configured deep links. Do not put private data in route query parameters. Viewport dimensions use Flutter logical pixels; the snapshot uses one image pixel per logical pixel. The selected pin is sent as screen coordinates; no DOM selector or scroll offset is inferred for native widgets.

`metadata` must be JSON-encodable and fit the server's 8,000-character limit, with keys of at most 64 characters. Feedback is limited to 5,000 characters. Optional name/email describe anonymous feedback; signed-in authors use their server account identity.

## Screenshots and platform setup

- Screenshots default to on. Placing a pin captures the app subtree with a pin marker before the form appears. **Include screenshot** starts checked; changes are remembered on the device across forms and app restarts (for the current overlay only if storage is unavailable). A preview is shown, and the image is uploaded only when checked and feedback is sent. Set `screenshots: false` to disable capture. The project must also enable screenshots.
- Flutter platform views, WebViews, video textures and some web renderers may not appear in the image. Capture failures leave text feedback available. Server upload limits still apply. If upload fails after feedback is saved, the UI says so and prevents resubmitting the saved feedback.
- Android: ensure `android/app/src/main/AndroidManifest.xml` includes `<uses-permission android:name="android.permission.INTERNET" />` outside `<application>` for release builds.
- macOS sandboxed builds: add `<key>com.apple.security.network.client</key><true/>` to both DebugProfile and Release entitlements.
- iOS: use HTTPS to work with App Transport Security. Screenshots use Flutter rendering and need no photo-library permission. Windows/Linux use normal network access.
- Web: allow the browser origin in Notette, use HTTPS to avoid mixed-content blocking, and permit your Notette host in the application's CSP `connect-src`.

## Authentication and Turnstile

Use inline sign-in, create an account when the project allows open signups, or choose **Approve there** to authorize from an existing dashboard session in your browser. Signup can ask you to confirm your email; the widget supports resending the confirmation and returning to sign-in. Passwords are never stored. Sessions are scoped to the server, project and origin and remembered using `flutter_secure_storage`; set `persistSession: false` on `NotetteClient` to keep sessions in memory only. Storage failures fall back to memory. Sign out clears the local session and requests revocation on the server.

When the project has Turnstile configured, `NotetteFeedback` automatically presents a challenge for anonymous feedback/replies, password sign-in and signup. Consuming apps only configure `NotetteClient` and wrap their app in `NotetteFeedback`; no challenge code, site key, or secret is needed in the app. The server supplies the public site key. Native challenges use the client's `appOrigin`; web challenges use the browser origin. Add that hostname to the Turnstile widget in Cloudflare and allow the origin in Notette.

If verification fails, expires or takes too long, choose **Retry verification** or **Cancel verification**. Your draft is kept. Notette may ask you to verify again before sending. If a connection error leaves you unsure whether feedback was sent, check the dashboard before retrying.

`turnstileTokenProvider: (siteKey) async => ...` remains an optional override for apps with their own challenge presentation. It must return a fresh non-empty token per call; errors, invalid tokens and timeouts stay inside the verification flow. No Turnstile secret belongs in an app.

Built-in presentation supports Android, iOS, macOS, Windows and web. Linux has no bundled WebView implementation; protected actions show an explanatory error unless the optional provider is supplied. Windows needs WebView2 and the WebView plugin's build prerequisites; Apple targets require iOS 12+ / macOS 10.14+. See [native WebView setup](https://inappwebview.dev/docs/intro/) for build requirements. Flutter web loads Cloudflare's script automatically; permit `https://challenges.cloudflare.com` in CSP `script-src` and `frame-src`. No manual script injection or web bridge setup is required.

Apps supplying their own Notette session can set `client.token` to a per-user **widget** session issued for this exact project and origin. Your application's own login token cannot be used. Never ship a shared admin token. Signed-in submissions skip Turnstile, as with the existing web widget. Configuration is refreshed before each action, including expired-session and sign-in requirement changes.

## Available features

- **Toolbar:** Comment, show/hide numbered pins, list, account and collapse. The collapsed circular launcher uses the same comment icon as the web widget and remains draggable. A signed-out tap opens sign-in, including on public projects. `position: Alignment.bottomLeft` changes the default corner; `initiallyOpen: true` starts expanded.
- **Browse:** current-screen feedback, shared Open/Resolved/All filters, search and refresh. Admins can browse all pages. Pin visibility and status filters are remembered per server/project/origin.
- **Threads:** author roles, relative timestamps, highlighted mentions, replies, authenticated screenshot previews with zoom, copy-for-agent Markdown, and admin dashboard links. Admins can resolve/reopen and delete with confirmation. Visibility and reply permissions follow the project settings; signed-in members do not gain admin privileges.
- **Compose and reply:** tinted fields with labels above them, remembered anonymous identity, `@` mention suggestions for signed-in users, screenshot opt-out, Ctrl/Cmd+Enter to send, Escape to close. `user: {'name': '...', 'email': '...'}` pre-fills anonymous identity without authenticating it. `deployment` supplies environment/branch/commit/URL context alongside `metadata`.
- **Account:** signup, email verification/resend, dashboard approval with cancel/denied/expired states, sign-out, and project email notification preferences when email is configured.

The sign-in card follows the web layout and uses tinted placeholder fields; placeholders disappear while typing, so labels never overlap input. Short entrance, hover, press, focus and resize animations respect reduced-motion preferences.

### Native routing and targeting

Route changes refresh page pins automatically. Supply `onNavigate: (path) async { ... }` to connect **Go to screen** to your router. `initialFeedbackId` opens a specific thread (waiting for required sign-in); Flutter web also accepts the `notette` URL query parameter. `openUrl` can override the system browser for approval and dashboard links.

Native pins use logical screen coordinates scaled to the current viewport. Flutter does not expose web DOM selectors, XPath, or automatic element/scroll anchoring. For changing native layouts, `resolvePin: (item, viewport) => ...` can return an application's current anchor position for an item; returning null uses the coordinate fallback. Pin capture records the screen, not private input values or a synthesized DOM tree.

Use an optional `NotetteController` for `open()`, `close()`, `comment()`, `list()`, `focus(id)` and `refresh()`. Pass it as `controller` to `NotetteFeedback`. Remove the widget or set `enabled: false` to hide it. Screen navigation belongs to the host router; opening a thread does not silently change screens.

### Remembered sessions

Notette accepts `flutter_secure_storage` versions 9.2.4 through 11.x. Follow [flutter_secure_storage platform setup](https://pub.dev/packages/flutter_secure_storage) for your resolved version and target, including Apple Keychain entitlements and Linux libsecret dependencies. When upgrading existing Android installations from 9.x to 11.x, follow the package's migration through 10.x to preserve stored data; 11.x requires Android minSdk 24 and compileSdk 37. Web persistence requires HTTPS (or localhost); WebAssembly support depends on the resolved storage version. If your app already owns session persistence, set `persistSession: false`, supply `client.token`, and manage its lifetime yourself.
