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
- `services/projects.ts` selects all project columns; never serialize raw rows containing `turnstileSecretKey`.
- `env.ts`: lazy runtime getters. New env vars also require `.env.example`, `docker-compose.yml`, README configuration table.
- `base-url.ts`: normalized `NOTETTE_URL`, else request origin. Email requires `SMTP_HOST` + `EMAIL_FROM`. Turnstile uses project DB keys, not env.

## Authentication and access

Base: `src/lib/server/`; enforcement: `src/hooks.server.ts`.
- `auth/password.ts`: scrypt; keep `scripts/reset-password.mjs` algorithm synchronized.
- `auth/sessions.ts`: SHA-256 token storage; dashboard `nts_`, widget `ntw_`; sliding expiry. Dashboard cookie `notette_session`: httpOnly, SameSite=Lax, HTTPS-secure.
- Widget API accepts bearer sessions bound to project AND origin; ignores cookies. Other routes ignore bearer tokens. Dashboard mutations use SvelteKit CSRF-checked form actions.
- `shared/roles.ts` under `src/lib`: owner/admin/member; last owner cannot be removed/demoted. Members are reviewers, not admins.
- `services/members.ts::ensureProjectAccess`: admins pass; members need membership or `openSignups` (insert membership). Recheck every widget request, login, approval and upload access. Revocation invalidates sessions; removing membership deletes project sessions.
- `widget-access.ts::requireWidgetViewer`: reject anonymous requests when `anonymousFeedbackAllowed=false`; exemptions: config, auth routes.
- `widget-thread.ts`: reviewers require `publicFeedbackVisible` to read; `reviewerRepliesEnabled` to reply. Only admins bypass. `/uploads/[id]` enforces equivalent access with dashboard cookie.
- `http.ts`: `requireAdmin`, `adminUser`, `api()` → JSON `ApiError`/zod errors. `rate-limit.ts`: process-local limits; reviewer writes keyed by user/IP, auth by IP.
- Inline login/signup: `routes/api/widget/[key]/auth/` under `src/`; signup requires open project, creates member. Unverified users cannot log in. `widget-viewer.ts::widgetViewer` adds project notification preference to all viewer responses.
- `services/auth-requests.ts`: dashboard approval uses UUID + hashed poll secret. Open popup synchronously before POST; no opener/postMessage dependency. Approval checks access; poll returns widget token once and deletes request. Expired unclaimed approvals revoke sessions.
- `auth/bootstrap.ts`: never modify existing users. `/setup` only when no users exist.

## Widget API and uploads

Base: `src/routes/api/widget/[key]/`.
- `src/hooks.server.ts`: resolve key + Origin (Referer fallback), validate allow-list, set `locals.widget={project,origin}`. `origins.ts` supports exact/wildcard origins; origin/key are not authentication.
- CORS: echo allowed origin, no credentials; errors need CORS too. Add new widget request headers to `src/lib/server/widget-cors.ts`.
- `config`: public project flags/site key/viewer. Never expose secret key.
- `feedback`: page scope for reviewers; project scope/admin mutations require admin. Create validates page origin, mentions and identity; returns item + one-time upload token.
- `feedback/[id]/comments`: visibility/reply/access checks apply before write.
- `feedback/[id]/screenshot`: PUT raw PNG/JPEG/WebP; sniff magic bytes, enforce size. Authorize with 15-minute `X-Notette-Upload-Token` or admin; members need upload token. GET uses authenticated blob fetch, not image-tag bearer headers.
- `mentions`: signed-in candidates. `notifications`: signed-in project preference.
- `src/lib/server/storage/index.ts`: `StorageAdapter {put,open,delete}`; `local.ts` atomic writes/key validation. Only `services/uploads.ts` touches storage; best-effort file deletion precedes row deletion.

## Turnstile

- `src/lib/server/turnstile.ts::requireTurnstile(event,project,token)`: enabled only with both project keys. Applies to anonymous feedback/replies and all widget password auth; dashboard login uses rate limit only.
- `turnstile-verify.ts`: pure verifier; invalid/missing token → 400 `turnstile_failed`; bad secret/outage → 503 `turnstile_unavailable`.
- Project settings action: admin-only; blank secret preserves saved value; removal clears both. No secret in loads/action responses. Existing projects default disabled.
- `src/lib/shared/turnstile-client.ts`: one explicit Cloudflare script; `src/widget/components/Turnstile.svelte`: shadow-root rendering, flexible width ≥300px. Reset single-use tokens after failures/successful replies. Surface hostname errors (`1102xx`).
- CSP (`svelte.config.js`, host sites): allow `https://challenges.cloudflare.com` in script/frame sources.

## Browser widget

Base: `src/widget/`.
- `vite.widget.config.ts`: IIFE `.widget-dist/notette.js`; inline emitted CSS through `__NOTETTE_CSS__`. Build before SvelteKit; `src/routes/notette.js/+server.ts` imports raw bundle, serves ETag/short cache/public CORS.
- `index.ts`: one `<notette-widget>`, open shadow root, isolated CSS; mounts controller context `notette`; exposes `window.Notette`, dispatches `notette:ready`.
- `lib/controller.svelte.ts`: sole state/side-effect owner; config, access, auth, compose/upload, threads, confirmations, mentions, notifications. Persist status filter per project; apply to both list and pins. Deep-link focus waits for required sign-in. Write 401 clears token/reopens auth; logout on private project collapses toolbar.
- `lib/api.ts`: credentials omitted; scoped bearer only. Local storage namespaced `notette:<key>:…`, author under `notette:author`.
- `lib/dom.ts`: verify generated selectors; locate selector/text → XPath → approximate coordinates. Never capture input values.
- `lib/isolate.ts`: block widget event bubbling; window capture focus guards stop host focus traps only for widget targets. Install before attaching host; remove on destroy. Host-pointer observers use capture; picker prevents pointerdown focus. Earlier window-capture traps can still win.
- No global CSS or history/fetch patches. Intercept host events only while picking (including Escape); scroll only on explicit focus. SPA detection: popstate/hashchange, debounced mutations, path polling. Turnstile script is the sole added host-document script exception.
- `lib/screenshot.ts`: html2canvas-pro; capture at selection time with matching viewport/scroll, before composer/keyboard. Freeze live animated properties into clone; reset canvas transform before click marker. Exclude widget; failure returns null, never blocks submission.
- Components map: `Launcher`/`AccountMenu` entry/account; `Picker`/`Composer` create; `Pins`/`Thread`/`Panel` browse; `AuthDialog` login/signup/verification/approval; `ConfirmDialog` destructive actions. Shared mention components use CSS variables.

## Flutter widget

Base: `packages/notette_flutter/lib/src/`.
- `client.dart`: existing widget API; caller owns client; scoped session defaults to `flutter_secure_storage` (server/project/origin key), memory fallback; `persistSession: false` opts out; 401/logout clears storage. Native uses configured HTTP(S) origin; web uses browser origin. No trusted native identity implied.
- `overlay.dart`: `NotetteFeedback` in MaterialApp builder above navigator; own Overlay ancestor for selection/tooltips. Drag stores fractional launcher position, survives routes/forms, resets on remount; safe-area/keyboard bounds with web margins (20px desktop, 12px narrow).
- `action_bar.dart` (part): shared draggable launcher/toolbar/placement surface, bottom-right anchor expands up/left and clamps each animation frame to safe/keyboard bounds. Width measured with text scaling; overflow switches to Comment/Pins/List rows then account+close. Pill buttons use web colors/comment path. Placement instructions replace toolbar; bar hit testing stays above pin-tap interception.
- Page URL = origin + current root-relative route. Logical-pixel viewport/screenshot; never synthesize DOM targets. DOM/XPath are not synthesized; `resolvePin` can supply native anchors, otherwise scale click by saved viewport.
- `panels.dart` (part of overlay): isolated light/indigo web-widget palette; compact cards, labelled tinted inputs, browse/search/status, account preferences, mention editor/text, agent Markdown. Auth uses a 340px web-style card, 12px padding, 10px radius, bottom84/corner alignment; tinted placeholder inputs never float labels. `_Reveal` fades/slides4px over150ms; hover/press/focus120ms, resizing150ms. Reduced-motion bypasses reveal/size animation. No host-theme mutation; use Overlay-compatible controls (no ancestor Navigator).
- `form.dart` (part): composer/thread/auth + shared Turnstile lifecycle. Signup/verification/resend; dashboard approval uses secure random id/secret, bounded polling + generation guard, never persists poll secret. Replies/mentions, screenshot GET with bearer, admin status/delete confirmation, clipboard/dashboard links. Preserve draft on errors/401; never replay uncertain writes.
- Toolbar/pins/list permission = admin OR publicFeedbackVisible with anonymous access/signed-in viewer; reply additionally reviewerRepliesEnabled unless admin. Recheck config before writes. Members never inherit admin bypass.
- Collapsed launcher is a 48px circle with the exact web comment path; tapping restores session/config and opens auth for every signed-out viewer (including public projects), toolbar for signed-in viewers. Programmatic open/comment retain explicit anonymous access. Overlay lazily restores session/config on expand; page polling detects router changes, generation checks discard stale list responses. Status/pin preferences scoped to client storageKey; author identity app-wide. `NotetteController` exposes open/close/comment/list/focus/refresh; initialFeedbackId/web notette query waits for required auth. Cross-screen navigation only via explicit onNavigate callback.
- Launcher enters cancellable pin placement; intercept host taps, then capture before dialog/keyboard. Submit logical-pixel `click` with matching page context; screenshot includes pin marker. Screenshots default on; `screenshots: false` disables capture. Checkbox preference persists app-wide via `shared_preferences` (`notette.includeScreenshot`), with overlay-memory fallback; project setting gates uploads. Preview before upload after creation. Upload failure is partial success, never resend saved feedback.
- `turnstile.dart`: built-in challenge, optional `turnstileTokenProvider`; native base URL = client origin. Android/iOS/macOS/Windows/web supported; Linux needs override. Minimum Flutter 3.24/Dart 3.5.
- Refresh config before action; skip challenge for authenticated feedback. Fresh token immediately consumed; retry only one definitive `turnstile_failed` with refreshed config. Never auto-replay network/other API failures.
- Two-minute challenge watchdog; expiry/error retry and cancellation preserve draft. Generation/completion guards ignore stale/duplicate callbacks; disposal completes pending verification without sending. No token cache/logs. Internal view-builder seam permits lifecycle tests without WebView.

## Dashboard

Base: `src/routes/(app)/`; shared UI: `src/lib/components/`, `src/app.css`.
- Layout gates members to `/` and `/settings/account`; admins get project navigation. Serialize dates/DTOs explicitly.
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
- `services/email-verification.ts`: required signup creates NULL `email_verified_at`, hashed 24h token + origin, returns 202 verificationRequired without session. Verification marks user/deletes tokens; resend silent for unknown/verified addresses. Admin-created/pre-existing users verified by default.

## Branding and agent export

- `static/favicon.svg` source mark; keep duplicated geometry in `scripts/render-logo.mjs` synchronized. Generated `static/logo.png` and `src/lib/server/email/logo.ts` are stored artifacts, not build outputs. Email uses CID PNG, not SVG/remote URL.
- `src/lib/shared/agent-format.ts`: shared widget/dashboard Markdown from `FeedbackDetailDto`; omit empty sections; preserve context, replies, metadata and screenshot links.

## Container boundaries

- `Dockerfile`: separate widget/server build and production deps; adapter-node output, tini, persistent uploads.
- `docker-entrypoint.sh`: derives ORIGIN from NOTETTE_URL; root fixes upload ownership then drops to node. Explicit --user skips ownership repair.
