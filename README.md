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
| `NOTETTE_URL`                                                           | —                          | Public base URL, e.g. `https://feedback.example.com`. Used for embed snippets, the admin sign-in popup, secure cookies and CSRF checks                                                        |
| `NOTETTE_ADMIN_EMAIL` / `NOTETTE_ADMIN_PASSWORD` / `NOTETTE_ADMIN_NAME` | —                          | Create this admin on startup if it does not exist                                                                                                                                             |
| `NOTETTE_UPLOADS_DIR`                                                   | `/data/uploads` (image)    | Screenshot storage directory                                                                                                                                                                  |
| `NOTETTE_MAX_SCREENSHOT_BYTES`                                          | `8388608`                  | Maximum screenshot upload size                                                                                                                                                                |
| `NOTETTE_SESSION_DAYS`                                                  | `30`                       | Session lifetime (sliding)                                                                                                                                                                    |
| `NOTETTE_AUTO_MIGRATE`                                                  | `true`                     | Apply migrations at startup                                                                                                                                                                   |
| `ADDRESS_HEADER` / `XFF_DEPTH`                                          | —                          | Set `ADDRESS_HEADER=x-forwarded-for` behind a reverse proxy so rate limiting sees real client IPs                                                                                             |
| `SMTP_HOST` / `EMAIL_FROM`                                              | —                          | Optional outgoing email. When both are set, email notifications and email verification become available; unset means no email is ever sent                                                    |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD`             | `587` / auto / — / —       | SMTP details. `SMTP_SECURE=true` uses implicit TLS (default for port 465); otherwise STARTTLS is used when the server offers it. User/password are optional for relays without authentication |
| `NOTETTE_EMAIL_BATCH_SECONDS`                                           | `60`                       | How long activity is collected per recipient before one digest email goes out                                                                                                                 |
| `PORT` / `HOST` / `BODY_SIZE_LIMIT`                                     | `3000` / `0.0.0.0` / `12M` | Node server settings                                                                                                                                                                          |

### Email, bot protection and accounts

- **Email:** set `SMTP_HOST` and `EMAIL_FROM`, plus any SMTP credentials. Admins receive new feedback and replies; members receive replies in their threads and @-mentions. Updates are batched for about a minute, with links back to the feedback. Users can opt out per project in settings or the web widget's account menu; unconfirmed accounts are not emailed. Use **Send test email** on the dashboard's _Account_ page to check delivery and see SMTP errors.
- **Verification:** projects can require email confirmation for signups. Links last 24 hours; users can resend them, and owners can mark accounts verified under _Users_. Admin-created accounts are already verified.
- **Turnstile:** configure keys per project in **Project settings → Bot protection**. Allow client hostnames in Cloudflare, plus `localhost` when testing. Missing hostnames can cause error `110200`. Web clients with a CSP must allow `https://challenges.cloudflare.com` in `script-src` and `frame-src`. Flutter presents challenges automatically.
- **Account recovery:** `docker compose exec app node scripts/reset-password.mjs you@example.com 'new-password'` resets a password or creates the account if missing. `/setup` is only available before any users exist.
- **Sessions:** revoke dashboard or widget sessions under _Settings → Account_. Changing your password signs out other sessions. Widget sign-in applies to the project and site where it was approved.

### Project bot protection

Configure Cloudflare Turnstile under **Project settings → Bot protection**. Save a site key and secret key to protect that project’s anonymous feedback and replies and widget sign-in/sign-up. Leave the secret blank to retain it, enter a replacement to rotate it, or select **Disable Turnstile and remove both keys**. Saved secrets are never returned to the browser. Add each embedding hostname in Cloudflare and allow `https://challenges.cloudflare.com` in the host site’s CSP `script-src` and `frame-src`.

Turnstile environment variables are no longer used. After upgrading, enter your keys for each project that needs protection; existing projects start with Turnstile disabled. The shared dashboard login keeps its rate limit and does not use project challenges.

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

Choose **Comment**, select an element and leave feedback. Feedback includes the page address, details about the selected element, browser information and an optional screenshot. Select a pin to open its thread. Screenshot failure does not block feedback.

Sign in with a Notette account or approve access through the dashboard. Projects can require sign-in and offer signup/verification. You stay signed in on that site until you sign out or the session expires. The avatar menu offers sign-out and notification preferences.

Admins can resolve, reopen, delete and use **List → All pages** to browse feedback. Signed-in users can type `@` to mention people with project access; admins can also mention other admins/owners. **Copy for Agent** copies feedback and context as Markdown from the thread or dashboard. Link directly to an item with `?notette=<feedback id>`.

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

`user` prefills anonymous identity; it does not authenticate. Expose build metadata to the client as needed (for example Vercel's `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA` and `VERCEL_URL`). `window.Notette` also provides `open()`, `close()`, `comment()`, `list()`, `focus(id)` and `destroy()`.

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

**Authentication:** existing Notette accounts can sign in; sessions stay in memory and sign-out revokes them. Create accounts through the dashboard or web signup flow. For Turnstile-protected projects, `NotetteFeedback` presents the challenge automatically and manages fresh tokens, errors, cancellation and retries. `turnstileTokenProvider` remains an optional override. Allow the app origin hostname in Cloudflare. Built-in challenges support Android, iOS, macOS, Windows and web; Linux requires the override for protected actions. See the [Flutter setup guide](packages/notette_flutter/README.md#authentication-and-turnstile) for WebView platform requirements. Signed-in submissions skip the challenge. A separate approval integration can set `client.token` to a per-user Notette widget session for this project/origin; never embed an admin token or use your app's own login token. Project and session state refresh before each action.

The Flutter widget collects feedback; threads, replies, mentions, signup, element picking and admin triage remain in the web widget/dashboard.

## License

MIT
