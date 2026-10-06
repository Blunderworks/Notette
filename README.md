# Notette

**Notette is a self-hosted client feedback tool for websites and Flutter apps.** Reviewers leave feedback directly in your app, with screenshots and context to help your team understand and fix issues.

The project has two parts:

- **Server:** a self-hosted API and dashboard. Manage projects, reviewers and feedback; search, reply, resolve issues, or copy feedback and context as Markdown with **Copy for Agent**.
- **Client widgets:** a web widget that works with any web framework, and a native Flutter overlay. Both send feedback to your server.

Core features need no external service. Email notifications and verification use optional SMTP; bot protection uses optional Cloudflare Turnstile.

## Server setup

### Docker Compose

Copy `.env.example` to `.env` and set your environment variables. Then run:

```yaml
name: notette
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: notette
      POSTGRES_USER: notette
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - notette-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U notette -d notette"]
      interval: 5s
      timeout: 5s
      retries: 12

  app:
    image: ghcr.io/blunderworks/notette:${NOTETTE_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgres://notette:${POSTGRES_PASSWORD}@db:5432/notette
    ports:
      - "3000:3000"
    volumes:
      - notette-uploads:/data/uploads
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3

volumes:
  notette-db:
  notette-uploads:
```

Open the URL and create your first admin at `/setup`. Alternatively, set `NOTETTE_ADMIN_EMAIL` and `NOTETTE_ADMIN_PASSWORD` before startup.

### Projects and access

Create a project, add its **allowed origins**, and copy its **client key** from _Settings & embed_. Origins include scheme and port, such as `https://app.example.com` or `http://localhost:5173`. Wildcards such as `https://*-myteam.vercel.app` and `http://localhost:*` are supported and a lone `*` allows any origin.

| Project setting                     | What it controls                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Allow anonymous feedback            | Default on. Turn off to require sign-in.                                            |
| Reviewers can see existing feedback | Default on. Includes threads and screenshots. Admins always see everything.         |
| Reviewers can reply                 | Default on. Enable replies.                                                         |
| Capture screenshots                 | Default on. Enable screenshot attachments.                                          |
| Open for signups                    | Default off. Lets visitors create accounts and existing accounts join on first use. |
| Require email verification          | Default off. Requires SMTP and confirmation before new signups can sign in.         |
| Your notifications                  | Your personal email preference for this project.                                    |

**Owners** manage users and roles under _Settings → Users_. **Admins** manage projects and feedback. **Members** see their assigned projects and account settings.

**Client keys are public identifiers, not secrets**, and can be regenerated in project settings. Origin checks are not authentication. For private review, require accounts, restrict membership and disable reviewer visibility as appropriate.

### Configuration

Add settings to `.env` for the Compose example above. The repository's [`.env.example`](.env.example) provides a commented template. When using the repository's Compose file, ensure any additional variables are also passed to the app service.

| Variable                                                                | Default                    | Description                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                          | —                          | PostgreSQL connection string (required)                                                                                                                                                       |
| `NOTETTE_URL`                                                           | —                          | Public base URL, e.g. `https://feedback.example.com`. Used for embed snippets, the admin sign-in popup, secure cookies and CSRF checks. Required for links in emails and for email verification |
| `NOTETTE_ADMIN_EMAIL` / `NOTETTE_ADMIN_PASSWORD` / `NOTETTE_ADMIN_NAME` | —                          | Create this admin on startup if it does not exist                                                                                                                                             |
| `NOTETTE_UPLOADS_DIR`                                                   | `/data/uploads` (image)    | Screenshot storage directory                                                                                                                                                                  |
| `NOTETTE_MAX_SCREENSHOT_BYTES`                                          | `8388608`                  | Maximum screenshot upload size                                                                                                                                                                |
| `NOTETTE_SESSION_DAYS`                                                  | `30`                       | Session lifetime (sliding)                                                                                                                                                                    |
| `NOTETTE_AUTO_MIGRATE`                                                  | `true`                     | Apply migrations at startup                                                                                                                                                                   |
| `ADDRESS_HEADER` / `XFF_DEPTH`                                          | —                          | Set `ADDRESS_HEADER=x-forwarded-for` behind a reverse proxy so rate limiting sees real client IPs. Only do this when the app port is reachable solely through the proxy (for example publish it as `127.0.0.1:3000:3000`); otherwise clients can fake their address |
| `SMTP_HOST` / `EMAIL_FROM`                                              | —                          | Optional outgoing email. When both are set, email notifications and email verification become available; unset means no email is ever sent                                                    |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD`             | `587` / auto / — / —       | SMTP details. `SMTP_SECURE=true` uses implicit TLS (default for port 465); otherwise STARTTLS is used when the server offers it. User/password are optional for relays without authentication |
| `NOTETTE_EMAIL_BATCH_SECONDS`                                           | `60`                       | How long activity is collected per recipient before one digest email goes out                                                                                                                 |
| `PORT` / `HOST` / `BODY_SIZE_LIMIT`                                     | `3000` / `0.0.0.0` / `12M` | Node server settings                                                                                                                                                                          |

### Email, bot protection and accounts

- **Email:** set `SMTP_HOST` and `EMAIL_FROM`, plus any SMTP credentials. Admins receive new feedback and replies; members receive replies in their threads and @-mentions. Updates are batched for about a minute, with links back to the feedback. Users can opt out per project in settings or the web widget's account menu; unconfirmed accounts are not emailed. Use **Send test email** on the dashboard's _Account_ page to check delivery and see SMTP errors.
- **Verification:** projects can require email confirmation for signups; this needs SMTP and `NOTETTE_URL`, which confirmation links are built from. Links last 24 hours; users can resend them, and owners can mark accounts verified under _Users_. Admin-created accounts are already verified. Anyone can sign up from the widget with any address, so widget signups always start unconfirmed: until they confirm, they can use the widget only on projects that do not require verification, cannot sign in to the dashboard and receive no email. _Users_ and the member picker label such accounts; check before adding or promoting one.
- **Turnstile:** configure keys per project in **Project settings → Bot protection**. Allow client hostnames in Cloudflare, plus `localhost` when testing. Missing hostnames can cause error `110200`. Web clients with a CSP must allow `https://challenges.cloudflare.com` in `script-src` and `frame-src`. Flutter presents challenges automatically.
- **Account recovery:** `docker compose exec app node scripts/reset-password.mjs you@example.com 'new-password'` resets a password or creates the account if missing. `/setup` is only available before any users exist.
- **Sessions:** revoke dashboard or widget sessions under _Settings → Account_. Changing your password signs out other sessions. Widget sign-in applies to the project and site where it was approved.

### Project bot protection

Configure Cloudflare Turnstile under **Project settings → Bot protection**. Save a site key and secret key to protect that project’s anonymous feedback and replies and widget sign-in/sign-up. Leave the secret blank to retain it, enter a replacement to rotate it, or select **Disable Turnstile and remove both keys**. Saved secrets are never returned to the browser. Add each embedding hostname in Cloudflare and allow `https://challenges.cloudflare.com` in the host site’s CSP `script-src` and `frame-src`.

Turnstile environment variables are no longer used. After upgrading, enter your keys for each project that needs protection; existing projects start with Turnstile disabled. The shared dashboard login keeps its rate limit and does not use project challenges.

### Identity verification

If your app has its own sign-in, it can vouch for its users so feedback shows who sent it. Your server signs a short-lived JSON Web Token (JWT) for the signed-in user and the widget sends it with each request. Notette verifies the token and records the user's ID, name and email with the feedback, marked **verified** in the dashboard. Verified users do not become Notette accounts. They count as signed in when anonymous feedback is off, and they skip bot protection.

Choose a method under **Project settings → Identity verification**:

| Method                   | Your side                                                                                                    | Notette stores                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Shared secret (HS256)    | Sign tokens with the secret Notette generates                                                                | The secret                    |
| Public key               | Sign with your own private key (RS256/PS256, ES256/ES384/ES512 or EdDSA)                                     | Your public key (PEM)         |
| Identity provider (JWKS) | Pass the ID token from Auth0, Cognito, Firebase, Supabase or another OpenID Connect provider; no server code | JWKS URL, issuer and audience |

The generated secret is shown once. **Rotate secret** issues a new one while the previous secret keeps working until you select **Revoke previous secret**, so you can deploy the new secret first.

Tokens need `sub` (your user ID, up to 255 characters) and `exp`. `name` and `email` are optional; the standard `given_name`/`family_name`/`preferred_username` claims also work, and an email marked `email_verified: false` is ignored. With a secret or public key, `aud` is optional but must be the project's client key when present. With JWKS, `iss` and `aud` must match the saved values; if your provider's tokens have no `aud`, add one with a custom token template. Keep tokens short-lived, such as 10 minutes; up to 60 seconds of clock difference is accepted.

For example, a Node.js endpoint that only signed-in users can call, using [`jose`](https://github.com/panva/jose):

```js
import { SignJWT } from "jose";

const key = new TextEncoder().encode(process.env.NOTETTE_IDENTITY_SECRET);

// GET /api/notette-token
export function notetteToken(user) {
  return new SignJWT({ name: user.name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setAudience("ntk_yourkey")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}
```

Never put the secret or a private key in browser or app code. A rejected token gets a `401` response with code `identity_invalid` and the reason, such as an expired token or a wrong signature. The widgets then fetch a fresh token once; if that also fails, they continue without the user's identity and report the reason (web: browser console; Flutter: `client.identityError`).

## Clients

### Web

Add the snippet from _Settings & embed_ to your root layout or each page:

```html
<script
  src="https://feedback.example.com/notette.js"
  data-key="ntk_yourkey"
  defer
></script>
```

Replace the host and key with your own. No framework-specific package is needed, and the widget does not change your site's styling. The dashboard's **Try it** tab lets you test before embedding.

Choose **Comment**, select an element and leave feedback. Feedback includes the page address, details about the selected element, browser information and an optional screenshot. Screenshots leave out passwords and anything typed into form fields. Select a pin to open its thread. Screenshot failure does not block feedback.

Sign in with a Notette account or approve access through the dashboard. Only approve a request you just started yourself; never one from a link someone sent you. Projects can require sign-in and offer signup/verification. You stay signed in on that site until you sign out or the session expires. The avatar menu offers sign-out and notification preferences.

**List** shows feedback on **This page** or, with the left-hand dropdown, on **All pages**: everything the viewer could see page by page, in one list. Selecting an item from another page opens that page, then its thread. Admins can also resolve, reopen and delete. Signed-in users can type `@` to mention people with project access; admins can also mention other admins/owners. **Copy for Agent** copies feedback and context as Markdown from the thread or dashboard. Link directly to an item with `?notette=<feedback id>`.

Optional script attributes: `data-environment`, `data-branch`, `data-commit`, `data-deployment-url`, `data-position="bottom-left"`, `data-open="true"`, `data-host` (API URL override), and `data-auto-init="false"`.

For programmatic setup:

```html
<script
  src="https://feedback.example.com/notette.js"
  data-auto-init="false"
  defer
></script>
<script>
  function setupNotette() {
    Notette.init({
      key: "ntk_yourkey",
      deployment: {
        environment: "preview",
        branch: "feat/x",
        commit: "abc1234",
        url: location.origin,
      },
      user: { name: "Jane Reviewer", email: "jane@example.com" },
      metadata: { appVersion: "1.4.2" },
    });
  }
  if (window.Notette) setupNotette();
  else window.addEventListener("notette:ready", setupNotette, { once: true });
</script>
```

`user` prefills anonymous identity; it does not authenticate (use `userToken` below for that). Expose build metadata to the client as needed (for example Vercel's `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA` and `VERCEL_URL`). Opening another page is a full page load by default. Single-page apps can pass `navigate` to use their router instead; the widget opens the thread once the address changes:

```js
Notette.init({
  key: "ntk_yourkey",
  navigate: (url) => router.push(new URL(url).pathname),
});
```

`window.Notette` also provides `open()`, `close()`, `comment()`, `list()`, `focus(id)`, `feedback()`, `identify()` and `destroy()`.

#### Feedback button and signed-in users

To collect feedback from one place, such as a **Send feedback** item in your settings, hide the floating button with `launcher: false` (or `data-launcher="false"`) and call `Notette.feedback()` from your own button. It opens a dialog that sends a message about the current page; when the project allows screenshots, users can attach an image (PNG, JPEG or WebP, up to `NOTETTE_MAX_SCREENSHOT_BYTES`) with **+ Attach screenshot**. `Notette.feedback({ metadata: { source: "settings" } })` adds metadata to that submission. `Notette.open()` still shows the full toolbar when needed.

With [identity verification](#identity-verification) enabled, pass `userToken`: a token or a function that returns a fresh one, or `null` when nobody is signed in. The widget calls the function on load, before the current token expires, and once more if a token is rejected:

```js
Notette.init({
  key: "ntk_yourkey",
  launcher: false,
  userToken: () =>
    fetch("/api/notette-token").then((r) => (r.ok ? r.text() : null)),
});
document
  .querySelector("#send-feedback")
  .addEventListener("click", () => Notette.feedback());
```

Call `Notette.identify(getToken)` after your user signs in and `Notette.identify(null)` after they sign out. Once a page passes `userToken` (even `null`) or calls `identify()`, the widget no longer offers Notette account sign-in there: your app owns sign-in. On projects that disallow anonymous feedback, signed-out users see a short explanation instead of the form.

#### Custom forms

You can also build your own form and post to the widget API. Requests must come from an allowed origin; browsers send the `Origin` header automatically, and server-side callers must set it themselves.

```js
await fetch("https://feedback.example.com/api/widget/ntk_yourkey/feedback", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userToken}`,
  },
  body: JSON.stringify({
    body: "The export button does nothing.",
    page: { url: location.href, title: document.title },
    metadata: { plan: "pro" },
  }),
});
```

Only `body` (up to 5,000 characters) and `page.url` are required; `page.url` must be on an allowed origin. Without a token, you may send unverified `author: { name, email }`, and projects with bot protection also require a `turnstileToken`. Projects that disallow anonymous feedback reject requests without a valid token. A `201` response contains the created `item`.

### Flutter

Requires Flutter 3.24+ and Dart 3.5+. Add to your app's `pubspec.yaml`, then run `flutter pub get`:

```yaml
dependencies:
  notette_flutter:
    git:
      url: https://github.com/Blunderworks/Notette.git
      ref: main
      path: packages/notette_flutter
```

Pin a reviewed tag or commit for reproducible builds. For a local checkout, replace the `git` block with `path: ../Notette/packages/notette_flutter`.

Create a client once in app state, close it in `dispose()`, and wrap the child in `MaterialApp.builder` or `MaterialApp.router.builder`:

```dart
import 'package:notette_flutter/notette_flutter.dart';

final feedbackClient = NotetteClient(
  serverUrl: Uri.parse('https://feedback.example.com'),
  projectKey: 'ntk_yourkey',
  appOrigin: Uri.parse('https://mobile.example.com'),
);

// In MaterialApp:
builder: (context, child) => NotetteFeedback(
  client: feedbackClient,
  screenPath: () => '/home', // Read the current route from your router.
  screenTitle: () => 'Home',
  metadata: const {'appVersion': '1.0.0'},
  screenshots: true,
  enabled: true,
  child: child!,
),
```

Drag the button with touch or mouse to move it; tap to open feedback. Its position survives navigation and form use while mounted and adjusts to the safe area, keyboard and resizing. Remounting or restarting resets it. Set `enabled: false` to hide the launcher.

For native apps, allow `appOrigin` in the project; it is a logical HTTPS origin and need not host a website. Flutter web uses its browser origin instead. `screenPath` must return a root-relative path such as `/settings`, evaluated when feedback opens. Native feedback URLs identify screens; they do not automatically become deep links. Avoid private data in URLs. Viewports and screenshots use logical pixels; DOM selectors, element pins and scroll positions are not inferred. Metadata must be JSON-encodable, at most 8,000 characters with keys up to 64 characters; feedback is limited to 5,000 characters.

**Screenshots:** off by default. When enabled, opening the form captures the app into memory; users must select **Include screenshot** before upload and can preview it. The project must also allow screenshots. Platform views, WebViews, video and some web renderers may be omitted. Capture failure leaves text feedback available; upload failure reports that feedback was saved without its screenshot.

**Platform setup:**

- Android: add `<uses-permission android:name="android.permission.INTERNET" />` outside `<application>` in the release manifest.
- macOS: add `<key>com.apple.security.network.client</key><true/>` to DebugProfile and Release entitlements for sandboxed apps.
- iOS: use HTTPS; no photo-library permission is needed. Windows/Linux use normal network access.
- Web: allow the browser origin in Notette and the server in your CSP's `connect-src`. Use HTTPS to avoid mixed-content blocking.

Use a server URL reachable from the device (`localhost` on a phone means that phone). A [complete example](packages/notette_flutter/example/lib/main.dart) is included; copy it into a `flutter create` app, add the dependency and replace the settings.

**Feedback dialog and signed-in users:** `showNotetteFeedbackDialog(context, client: feedbackClient, screenPath: '/settings')` opens a standalone feedback dialog, for example from your settings screen, without wrapping the app in `NotetteFeedback`. With [identity verification](#identity-verification), pass `userTokenProvider: () => myApi.fetchNotetteToken()` to `NotetteClient`, returning `null` when nobody is signed in. Feedback is then attributed to your user and Notette sign-in is not offered. Call `client.resetIdentity()` after your user signs in or out. See the [Flutter guide](packages/notette_flutter/README.md#feedback-dialog-and-signed-in-users).

**Authentication:** existing Notette accounts can sign in; sessions stay in memory and sign-out revokes them. Create accounts through the dashboard or web signup flow. For Turnstile-protected projects, `NotetteFeedback` presents the challenge automatically and manages fresh tokens, errors, cancellation and retries. `turnstileTokenProvider` remains an optional override. Allow the app origin hostname in Cloudflare. Built-in challenges support Android, iOS, macOS, Windows and web; Linux requires the override for protected actions. See the [Flutter setup guide](packages/notette_flutter/README.md#authentication-and-turnstile) for WebView platform requirements. Signed-in submissions skip the challenge. A separate approval integration can set `client.token` to a per-user Notette widget session for this project/origin; never embed an admin token or put your app's own login token in `client.token` (use `userTokenProvider` instead). Project and session state refresh before each action.

The Flutter widget collects feedback; threads, replies, mentions, signup, element picking and admin triage remain in the web widget/dashboard.

## License

MIT
