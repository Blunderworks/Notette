# ARCHITECTURE — LLM reference

Search/read only relevant sections. Global rules: `AGENTS.md`. Keep terse file/symbol pointers, boundaries, invariants and non-obvious coupling. Omit tutorials, setup, contributor/release/publishing guides, history and facts readily recoverable from code. Paths below are repository-relative; paths within a section use its stated base.

## System map

- SvelteKit/Svelte 5/TypeScript; adapter-node; PostgreSQL/Drizzle; filesystem screenshots.
- `src/routes/`: `(app)` dashboard, `(auth)` login/setup/verification, `(popup)/widget/authorize` approval, `api/widget/[key]` bearer API, `notette.js` standalone bundle.
- `src/lib/server/`: auth, DB, services, email, storage, validation/access helpers. Never import into widget/client code.
- `src/lib/shared/`: framework-free DTOs (`types.ts`), roles, mentions, Turnstile loader, agent Markdown formatter.
- `src/lib/components/`: dashboard UI; `MentionTextarea.svelte`/`MentionText.svelte` also used by widget.
- `src/widget/`: browser widget. `packages/notette_flutter/`: Flutter client/overlay.

## Data and configuration

Base: `src/lib/server/`.
- `db/schema.ts` is authoritative. Schema changes require generated `drizzle/` migration; never modify shipped SQL.
- `db/index.ts`: lazy DB proxy. Module imports must work without `DATABASE_URL` during build analysis; keep pure helpers DB-free.
- `db/migrate.ts`, `src/hooks.server.ts`: startup waits for DB, migrates unless `NOTETTE_AUTO_MIGRATE=false`; other failures abort startup.
- Feedback numbers: increment `projects.feedback_seq` transactionally. Author DTO roles use current `users` left join; deleted users become anonymous.
- `services/projects.ts` selects all project columns; never serialize raw rows containing `turnstileSecretKey`, `identitySecret` or `identityPreviousSecret`.
- `env.ts`: lazy runtime getters. New env vars also require `.env.example`, `docker-compose.yml`, README configuration table.
- `base-url.ts`: normalized `NOTETTE_URL`, else request origin. Email requires `SMTP_HOST` + `EMAIL_FROM`. Turnstile uses project DB keys, not env.

## Authentication and access

Base: `src/lib/server/`; enforcement: `src/hooks.server.ts`.
- `auth/password.ts`: scrypt; keep `scripts/reset-password.mjs` algorithm synchronized. Sign-in uses `verifyUserPassword` (dummy hash when the user is missing: no timing enumeration).
- `auth/sessions.ts`: SHA-256 token storage; dashboard `nts_`, widget `ntw_`; sliding expiry. Dashboard cookie `notette_session`: httpOnly, SameSite=Lax, HTTPS-secure.
- Widget API accepts bearer sessions bound to project AND origin; ignores cookies. Other routes ignore bearer tokens. Dashboard mutations use SvelteKit CSRF-checked form actions; CSRF is not authorization.
- `dashboard-access.ts::dashboardAccess(route.id,user)`: sole `(app)` rule: signed in; members only `/(app)` and `/(app)/settings/account`. Layout loads are skippable (form actions; `__data.json?x-sveltekit-invalidated`), so `hooks.server.ts::guardDashboard` enforces it for every `(app)` request: thrown redirect when signed out; members get 403 for data/action requests (ActionResult JSON for `x-sveltekit-action`), full page views fall through to the layout's styled 403. Never rely on a load for access control. Owner-only actions still check owner themselves.
- `redirect.ts::safeRedirectTarget`: reject whitespace/control chars/backslash, resolve against a dummy origin, keep only same-origin path+query+hash (browsers strip tabs: `/\t/evil`).
- `shared/roles.ts` under `src/lib`: owner/admin/member; last owner cannot be removed/demoted. Members are reviewers, not admins. `services/users.ts::createFirstOwner`/`changeUserKeepingOwner` hold one advisory lock: count+write atomically (setup race, concurrent demotion).
- `services/members.ts::ensureProjectAccess`: admins pass; unconfirmed accounts fail on `requiresConfirmedEmail(project)` projects; members need membership or `openSignups` (insert membership). Recheck every widget request, login, approval and upload access. Revocation invalidates sessions; removing membership deletes project sessions.
- `widget-access.ts::requireWidgetViewer`: reject anonymous requests when `anonymousFeedbackAllowed=false`; exemptions: config, auth routes.
- `widget-thread.ts`: reviewers require `publicFeedbackVisible` to read; `reviewerRepliesEnabled` to reply. Only admins bypass. `/uploads/[id]` enforces equivalent access with dashboard cookie.
- `http.ts`: `requireAdmin`, `adminUser`, `api()` → JSON `ApiError`/zod errors. `rate-limit.ts`: process-local, bounded (key length, entry count). Key by `clientNetwork` (IPv4 or IPv6 /64), never raw `clientAddress`; reviewer writes by user/app user/network; sign-in also per account (`ACCOUNT_LOGIN_LIMIT`, shared dashboard+widget); resend also per address.
- Inline login/signup: `routes/api/widget/[key]/auth/` under `src/`; signup requires open project, creates member with NULL `email_verified_at` (any address can be typed; never trust it). Widget login refuses unconfirmed accounts only on `requiresConfirmedEmail` projects; dashboard login always requires confirmation. `widget-viewer.ts::widgetViewer` adds project notification preference to all viewer responses.
- `services/auth-requests.ts`: dashboard approval uses UUID + hashed poll secret. Open popup synchronously before POST; no opener/postMessage dependency. Approval checks access; poll returns widget token once and deletes request. Expired unclaimed approvals revoke sessions. Requests are not bound to the approving browser (anyone can create one with a spoofed Origin): keep the 5-minute TTL and the popup's "only approve if you started it" warning.
- `auth/bootstrap.ts`: never modify existing users. `/setup` only when no users exist (`createFirstOwner`).

## Identity verification

Host app vouches for its users with a signed JWT; no Notette account. Base: `src/lib/server/`.
- `identity.ts::verifyIdentityToken` (jose, DB-free, unit-tested) per `projects.identity_mode`: `secret` HS256 with current then previous secret (rotation); `public_key` SPKI PEM, algorithms pinned by key type (`parsePublicKey` rejects private/<2048-bit RSA); `jwks` remote set cached per URL, issuer+audience required, HTTPS unless localhost. Always require `exp`+`sub`, 60s skew. secret/public_key: `aud` optional but must include client key. `identityFromClaims`: OIDC name fallbacks; drop invalid or `email_verified:false` email.
- `src/hooks.server.ts`: bearer matching `isIdentityToken` (compact JWS) is verified, else treated as widget session. Rejection answers 401 `identity_invalid` / 503 `identity_unavailable` with CORS before routing; never downgrade to anonymous. `locals.identity` is exclusive with `locals.user`.
- Identified user = reviewer with trusted author: passes `requireWidgetViewer` sign-in gate, skips Turnstile, no mentions, never a notification recipient, rate-limited as `app:<sub>` (`widget-access.ts::widgetWriterKey`). Name/email from claims (client `author` ignored); `external_user_id` on feedback/comments. Never map claims onto `users` (no email merge).
- DTOs: `isVerified` on items/comments; `authorExternalId` only with `includeEmail` (dashboard). Config returns `identity`.
- Settings actions `identity`/`rotateIdentitySecret`/`revokePreviousIdentitySecret` check admin role explicitly. Secrets appear only in the generating action's result, never in loads.

## Widget API and uploads

Base: `src/routes/api/widget/[key]/`.
- `src/hooks.server.ts`: resolve key + Origin (Referer fallback), validate allow-list, set `locals.widget={project,origin}`. Detect widget requests with `widget-cors.ts::widgetApiKey` (matched route id; SvelteKit decodes `/api/%77idget/…` before routing), not the raw path. `origins.ts` supports exact/wildcard origins; origin/key are not authentication.
- CORS: echo allowed origin, no credentials; errors need CORS too. Add new widget request headers to `src/lib/server/widget-cors.ts`.
- `config`: public project flags/site key/viewer. Never expose secret key.
- `feedback`: page or project scope for anyone passing `publicFeedbackVisible` (project scope = union of page scopes); admin mutations require admin. Create validates page origin, mentions and identity; returns item + one-time upload token. Custom forms need only `body` + `page.url` (viewport/scroll optional).
- `feedback/[id]/comments`: visibility/reply/access checks apply before write.
- `feedback/[id]/screenshot`: PUT raw PNG/JPEG/WebP; sniff magic bytes, enforce size. Authorize with 15-minute `X-Notette-Upload-Token` (claimed by one conditional UPDATE before the body is read: no parallel reuse) or admin; members need upload token. GET uses authenticated blob fetch, not image-tag bearer headers.
- `mentions`: signed-in candidates. `notifications`: signed-in project preference.
- `src/lib/server/storage/index.ts`: `StorageAdapter {put,open,delete}`; `local.ts` atomic writes/key validation. Only `services/uploads.ts` touches storage; best-effort file deletion precedes row deletion.

## Turnstile

- `src/lib/server/turnstile.ts::requireTurnstile(event,project,token)`: enabled only with both project keys. Applies to anonymous feedback/replies and all widget password auth; dashboard login uses rate limit only.
- `turnstile-verify.ts`: pure verifier; invalid/missing token → 400 `turnstile_failed`; bad secret/outage → 503 `turnstile_unavailable`.
- Project settings action: admin-only; blank secret preserves saved value; removal clears both. No secret in loads/action responses. Existing projects default disabled.
- `src/lib/shared/turnstile-client.ts`: one explicit Cloudflare script; check `turnstile.render` is a function (DOM clobbering); `src/widget/components/Turnstile.svelte`: shadow-root rendering, flexible width ≥300px. Reset single-use tokens after failures/successful replies. Surface hostname errors (`1102xx`).
- CSP (`svelte.config.js`, host sites): allow `https://challenges.cloudflare.com` in script/frame sources.

## Browser widget

Base: `src/widget/`.
- `vite.widget.config.ts`: IIFE `.widget-dist/notette.js`; inline emitted CSS through `__NOTETTE_CSS__`. Build before SvelteKit; `src/routes/notette.js/+server.ts` imports raw bundle, serves ETag/short cache/public CORS.
- `index.ts`: one `<notette-widget>`, open shadow root, isolated CSS; mounts controller context `notette`; exposes `window.Notette`, dispatches `notette:ready`.
- `lib/controller.svelte.ts`: sole state/side-effect owner; config, access, auth, compose/upload, threads, confirmations, mentions, notifications. Persist status filter per project; apply to both list and pins. `ui.listScope` (Panel "This page"/"All pages" select, everyone with `canSeeFeedback`; unset → admins project) persisted per project. Other-page items: `navigateTo` uses init `navigate(url)` (pendingFocusId, applied after `onLocationMaybeChanged` reloads items; throw → fallback) else session key + `location.assign`. Deep-link focus waits for required sign-in. Write 401 clears token/reopens auth (not for `identity_*` codes); logout on private project collapses toolbar.
- `lib/api.ts`: credentials omitted; one bearer from `ApiAuth.credential()`. Local storage namespaced `notette:<key>:…`, author under `notette:author`.
- Identity (`userToken` string or getter): replaces the session bearer; getter cached until unverified `exp` minus 30s, concurrent calls share one fetch, `identityGeneration` discards stale fetches/config loads. `identity_invalid` → one retry with a different fresh token (request never reached a handler); then `failIdentity`: continue without identity, `ui.identityError`, console error. `identityManaged` (init passed `userToken` key, even null, or `identify()` called) → no Notette sign-in (`openSignIn` toasts). `hasAuthor` = viewer or identity for sign-in gate/Turnstile/author fields.
- `launcher: false` / `data-launcher="false"`: no bubble; page items load only once expanded. `Notette.feedback()` → `FeedbackDialog.svelte`: page context only (no click/element), no capture: optional user-chosen PNG/JPEG/WebP (`+ Attach screenshot`, type- and size-checked on pick against config `project.maxScreenshotBytes` = `NOTETTE_MAX_SCREENSHOT_BYTES`, 8 MB fallback for older servers, dimensions via `createImageBitmap`, upload query `w/h` omitted when unknown) uploaded through the same token flow, queued until ready or sign-in; sign-in-only + identity mode without identity shows explanation. Centre dialogs without `transform` (`nt-fade-in` animates it).
- `lib/dom.ts`: verify generated selectors; locate selector/text → XPath → approximate coordinates. Never capture input values. Locators come from other reviewers: `src/lib/shared/locators.ts` accepts only generated shapes (`/html/tag[n]…`; ids/tags/classes/test-id attrs/`:nth-of-type` with `>`); validation drops others, `locateElement` never evaluates them. Keep generator and validators in sync.
- `lib/isolate.ts`: block widget event bubbling; window capture focus guards stop host focus traps only for widget targets. Install before attaching host; remove on destroy. Host-pointer observers use capture; picker prevents pointerdown focus. Earlier window-capture traps can still win.
- No global CSS or history/fetch patches. Intercept host events only while picking (including Escape); scroll only on explicit focus. SPA detection: popstate/hashchange, debounced mutations, path polling. Turnstile script is the sole added host-document script exception.
- `lib/screenshot.ts`: html2canvas-pro; capture at selection time with matching viewport/scroll, before composer/keyboard. Freeze live animated properties into clone; reset canvas transform before click marker. Exclude widget; failure returns null, never blocks submission. `maskEnteredValues` blanks password and edited text fields in the clone.
- Components map: `Launcher`/`AccountMenu` entry/account; `Picker`/`Composer`/`FeedbackDialog` create; `Pins`/`Thread`/`Panel` browse; `AuthDialog` login/signup/verification/approval; `ConfirmDialog` destructive actions. Shared mention components use CSS variables.

## Flutter widget

Base: `packages/notette_flutter/lib/src/`.
- Secure storage dependency permits 9.2.4–11.x; use only shared default-constructor/read/write/delete APIs. Host apps own native platform requirements and storage migration across majors.
- `client.dart`: existing widget API; caller owns client; scoped session defaults to `flutter_secure_storage` (server/project/origin key), memory fallback; `persistSession: false` opts out; 401/logout clears storage. Native uses configured HTTP(S) origin; web uses browser origin. Origin is no trusted native identity.
- `client.dart` identity: `userTokenProvider` token replaces session bearer; cached until `exp` minus 30s; one retry on `identity_invalid` with a different token; identity 401s never clear the session; `identity_*` failure sets `identityError` and continues without identity until `resetIdentity()`. Provider set → identity mode: form/overlay hide Notette sign-in, identity counts as author (`config['identity']`), sign-in-only projects show an explanation.
- `dialog.dart::showNotetteFeedbackDialog`: `_FeedbackForm` in `showDialog` (`centered`, nullable `pin` → no click, no capture); `pickImage` (image_picker gallery) enables `+ Attach screenshot`, same size check via `file.length()` before reading bytes, magic-byte check `_imageType`, upload `contentType` from bytes; no overlay needed; resets a rejected identity per open.
- `overlay.dart`: `NotetteFeedback` in MaterialApp builder above navigator; own Overlay ancestor for selection/tooltips. Drag stores fractional launcher position, survives routes/forms, resets on remount; safe-area/keyboard bounds with web margins (20px desktop, 12px narrow).
- `action_bar.dart` (part): shared draggable launcher/toolbar/placement surface, bottom-right anchor expands up/left and clamps each animation frame to safe/keyboard bounds. Width measured with text scaling; overflow switches to Comment/Pins/List rows then account+close. Pill buttons use web colors/comment path. Placement instructions replace toolbar; bar hit testing stays above pin-tap interception.
- Page URL = origin + current root-relative route. Logical-pixel viewport/screenshot; never synthesize DOM targets. DOM/XPath are not synthesized; `resolvePin` can supply native anchors, otherwise scale click by saved viewport.
- `panels.dart` (part of overlay): isolated light/indigo web-widget palette; compact cards, labelled tinted inputs, browse/search/status, account preferences, mention editor/text, agent Markdown. Auth uses a 340px web-style card, 12px padding, 10px radius, bottom84/corner alignment; tinted placeholder inputs never float labels. `_Reveal` fades/slides4px over150ms; hover/press/focus120ms, resizing150ms. Reduced-motion bypasses reveal/size animation. No host-theme mutation; use Overlay-compatible controls (no ancestor Navigator).
- `form.dart` (part): composer/thread/auth + shared Turnstile lifecycle. Signup/verification/resend; dashboard approval uses secure random id/secret, bounded polling + generation guard, never persists poll secret. Replies/mentions, screenshot GET with bearer, admin status/delete confirmation, clipboard/dashboard links. Preserve draft on errors/401; never replay uncertain writes.
- Toolbar/pins/list permission = admin OR publicFeedbackVisible with anonymous access/signed-in viewer; reply additionally reviewerRepliesEnabled unless admin. Recheck config before writes. Members never inherit admin bypass.
- Collapsed launcher is a 48px circle with the exact web comment path; tapping restores session/config and opens auth for every signed-out viewer (including public projects), toolbar for signed-in viewers. Programmatic open/comment retain explicit anonymous access. Overlay lazily restores session/config on expand; page polling detects router changes, generation checks discard stale list responses. Status/pin preferences scoped to client storageKey; author identity app-wide. `NotetteController` exposes open/close/comment/list/focus/refresh; initialFeedbackId/web notette query waits for required auth. Cross-screen navigation only via explicit onNavigate callback: thread **Go to screen**, and `_select` for other-screen list items before `_focus`. `_BrowsePanel` scope/status use `_Select` (MenuAnchor; DropdownButton/PopupMenu need a Navigator); scope persisted `storageKey:scope`, unset → admins all pages.
- Launcher enters cancellable pin placement; intercept host taps, then capture before dialog/keyboard. Submit logical-pixel `click` with matching page context; screenshot includes pin marker. Screenshots default on; `screenshots: false` disables capture. Checkbox preference persists app-wide via `shared_preferences` (`notette.includeScreenshot`), with overlay-memory fallback; project setting gates uploads. Preview before upload after creation. Upload failure is partial success, never resend saved feedback.
- `turnstile.dart`: built-in challenge, optional `turnstileTokenProvider`; native base URL = client origin. Android/iOS/macOS/Windows/web supported; Linux needs override. Minimum Flutter 3.24/Dart 3.5.
- Refresh config before action; skip challenge for authenticated feedback. Fresh token immediately consumed; retry only one definitive `turnstile_failed` with refreshed config. Never auto-replay network/other API failures.
- Two-minute challenge watchdog; expiry/error retry and cancellation preserve draft. Generation/completion guards ignore stale/duplicate callbacks; disposal completes pending verification without sending. No token cache/logs. Internal view-builder seam permits lifecycle tests without WebView.

## Dashboard

Base: `src/routes/(app)/`; shared UI: `src/lib/components/`, `src/app.css`.
- Layout applies `dashboardAccess` to page views (members: home + account); admins get project navigation. Serialize dates/DTOs explicitly.
- Project `settings/+page.svelte` card order: Embed, Members, Project settings, Your notifications, Bot protection, Identity verification, Danger zone.
- Settings forms that show saved values use `update({ reset: false })` (`keepValues`); default enhance reset blanks inputs whose values did not change. Turnstile form clears only secret/remove.
- `src/lib/confirm.svelte.ts::confirmSubmit`: synchronously cancel enhance submission, await branded modal, resubmit. Do not use async cancellation or onsubmit preventDefault; enhance can still submit. Native confirm prohibited.
- `src/lib/server/feedback-bulk.ts::bulkFeedbackAction`: shared list actions; project page must restrict IDs to its project. Confirm deletes, clear selection after success.
- Project `/try` embeds real widget; instance origin must be allowed. Login named actions: login/resend.

## Email, notifications, mentions

Base: `src/lib/server/`.
- Email disabled → no queues, hide notification controls, signup immediately verified. `email/mailer.ts`: lazy SMTP; shared `messageFor()` attaches CID PNG. Templates/digest pure, escaped HTML, inline styles.
- `services/notifications.ts`: queue after feedback/reply (API AND dashboard); never fail writes for email. Recipients: admins, signed-in participants, mentions. Exclude author, anonymous/unverified users, revoked members, project mutes. Mention kind overrides event kind.
- DB outbox survives restart; cascade deleted feedback/comments. Scheduler batches per recipient; mark sent only after SMTP acceptance; bounded backoff, overlap guard, hourly cleanup.
- `notification_mutes`: row means off. `widgetViewer()` fills preference everywhere. Account test-email action admin-only/rate-limited.
- `services/mentions.ts`: members can target project members; admins additionally owners/admins; exclude self/anonymous. `resolveMentions` filters submitted IDs (max20). Never enumerate admins to members.
- `src/lib/shared/mentions.ts`: text + `{id,name}` references; longest-name matching. Shared textarea retains only mentions still present; DTO display names/highlighting use shared parsing.
- `services/email-verification.ts`: hashed 24h token + origin; required signup returns 202 verificationRequired without session. Links only from `NOTETTE_URL` (`config.verificationEmailEnabled` = email + public URL), never the Host header; email carries no signup-supplied text. Verification marks user/deletes tokens; resend silent for unknown/verified addresses. Admin-created/pre-existing users verified by default.
- Reviewer display text (author/signup names, page titles, identity names) passes `validation.ts::singleLine` (no control chars/newlines): it reaches email subjects, text emails and Markdown.

## Branding and agent export

- `static/favicon.svg` source mark; keep duplicated geometry in `scripts/render-logo.mjs` synchronized. Generated `static/logo.png` and `src/lib/server/email/logo.ts` are stored artifacts, not build outputs. Email uses CID PNG, not SVG/remote URL.
- `src/lib/shared/agent-format.ts`: shared widget/dashboard Markdown from `FeedbackDetailDto`; omit empty sections; preserve context, replies, metadata and screenshot links. Only the body keeps lines (quoted); other values `inline`, code via `code()`, metadata fence longer than any backtick run; self-reported names get `(anonymous)`. Flutter `panels.dart::_agentMarkdown` mirrors this.
- Dashboard links from reviewer data only when `format.ts::isHttpUrl`; validation drops non-http(s) `deployment.url`.

## Container boundaries

- `Dockerfile`: separate widget/server build and production deps; adapter-node output, tini, persistent uploads. Node stages run on `$BUILDPLATFORM` (Node under QEMU crashes arm64 release builds); only `runtime` is target-platform, so production deps must stay pure JS (a native module needs a target-platform install stage). `/app` stays root-owned; runtime user writes only `/data`.
- `docker-entrypoint.sh`: derives ORIGIN from NOTETTE_URL; root fixes upload ownership then drops to node. Explicit --user skips ownership repair.
