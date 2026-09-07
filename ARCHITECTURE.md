# ARCHITECTURE

This file contains instructions specific to individual features or sections of the app. Read only the section(s) relevant to the current task — do not read this file in full unless doing a broad refactor. Search it by section heading or keyword as needed.

For rules that apply to every task, see [AGENTS.md](AGENTS.md) — that file must always be read in full first.

## How to use this file

- Each `##` section below covers one feature/area of the app.
- When you build a new feature or materially change an existing one, add or update its section here.
- Keep sections self-contained so they can be searched and read independently.

---

## Overview and stack

Notette is a single SvelteKit (Svelte 5, TypeScript) application that serves four things from one deployment: the admin dashboard (`src/routes/(app)`), the auth pages (`src/routes/(auth)`, `(popup)`), the JSON API used by the widget (`src/routes/api/widget/[key]/…`), and the compiled standalone widget bundle (`GET /notette.js`). Data lives in PostgreSQL via Drizzle ORM; screenshots live on a local filesystem volume behind a storage abstraction. `@sveltejs/adapter-node` produces the production server in `build/`, packaged by the Dockerfile with PostgreSQL in `docker-compose.yml`.

Key directories:

- `src/lib/server/` — everything server-only: `db/` (schema, client, migrations), `auth/` (passwords, sessions, cookies, bootstrap admin), `services/` (users, projects, feedback, comments, uploads, auth-requests), `storage/`, `origins.ts` (CORS allow-list), `rate-limit.ts`, `http.ts` (API error helpers), `validation.ts` (zod schemas), `widget-cors.ts`, `widget-thread.ts`.
- `src/lib/shared/` — framework-free code used by both the server/dashboard and the widget: `types.ts` (DTOs and the feedback payload) and `agent-format.ts` (Copy for Agent).
- `src/lib/components/`, `src/lib/format.ts`, `src/lib/embed.ts` — dashboard UI helpers.
- `src/widget/` — the widget (see *Widget*).
- `drizzle/` — generated SQL migrations. `scripts/reset-password.mjs` — admin recovery.

The package manager is pnpm (version pinned via `packageManager` in `package.json`; `pnpm-lock.yaml` is the only lockfile). Verification commands: `pnpm run check` (svelte-check across app + widget), `pnpm test` (vitest; DOM tests use jsdom), `pnpm run build`. The Docker CI job builds the image.

## Data layer

Schema: `src/lib/server/db/schema.ts`. Tables: `users` (role `owner|admin`), `projects` (client key, `allowed_origins` jsonb array, visibility/reply/screenshot flags, `feedback_seq` counter), `sessions` (id = SHA-256 of the raw token, `kind` `dashboard|widget`, widget sessions carry `project_id` + `origin`), `auth_requests` (widget sign-in handshake), `feedback` (thread root with all captured context; `number` is per-project sequential, allocated by incrementing `projects.feedback_seq` inside a transaction), `comments` (replies), `uploads` (screenshots; `feedback_id` cascade).

Migrations are generated with `pnpm run db:generate` (drizzle-kit, config in `drizzle.config.ts`) into `drizzle/` and applied at startup by `runMigrations()` (`src/lib/server/db/migrate.ts`) from the `init` hook in `src/hooks.server.ts` unless `NOTETTE_AUTO_MIGRATE=false`. Before migrating, `waitForDatabase()` retries the connection for up to about a minute so the app container survives PostgreSQL still booting; any other error aborts startup. Never edit generated SQL by hand after it has shipped; add a new migration instead. Every schema change must ship with its generated migration in the same change.

`src/lib/server/db/index.ts` exports `db`, a Proxy that creates the pooled `postgres` client from `DATABASE_URL` on first use. Keep it lazy: SvelteKit's post-build route analysis imports server modules inside the Docker build where no `DATABASE_URL` exists, and an eager client would abort `pnpm run build`. Unit tests must not import modules that pull the db in transitively (keep pure helpers like `origins.ts`, `password.ts`, `agent-format.ts` free of db imports).

## Configuration

`src/lib/server/env.ts` exposes `config` with lazy getters over `$env/dynamic/private` so the same image is configured at runtime. Add new variables there, in `.env.example`, `docker-compose.yml` and the README table. `NOTETTE_URL` (normalised, no trailing slash) is the public base URL used for embed snippets, authorize URLs and absolute screenshot links (`src/lib/server/base-url.ts` falls back to the request origin).

## Authentication and sessions

Passwords: scrypt via Node's `crypto` (`src/lib/server/auth/password.ts`, format `scrypt$N$r$p$salt$hash`; `scripts/reset-password.mjs` duplicates the algorithm and must stay in sync). Minimum length 10.

Sessions (`src/lib/server/auth/sessions.ts`): random 32-byte tokens with prefixes `nts_` (dashboard) / `ntw_` (widget); only the SHA-256 is stored. Sliding expiry (`NOTETTE_SESSION_DAYS`), `last_used_at` throttled to one write per 5 minutes. Dashboard sessions ride in the `notette_session` httpOnly SameSite=Lax cookie (secure when the request is HTTPS). Widget sessions are bearer tokens bound to one project and one origin; `hooks.server.ts` only honours them on `/api/widget/*` and only when the request origin matches the session origin. Cookies are ignored on widget routes and bearer tokens are ignored elsewhere, which keeps CSRF concerns confined to form actions (protected by SvelteKit's origin check) and makes third-party cookies unnecessary.

Widget sign-in handshake (`src/lib/server/services/auth-requests.ts`, routes under `api/widget/[key]/auth/`): the widget generates a UUID request id and a random poll secret, opens `NOTETTE_URL/widget/authorize?request=<id>` synchronously in the click handler (popup blockers), then POSTs the id + secret (hash stored) from the allowed origin. The authorize page (`src/routes/(popup)/widget/authorize`) requires a dashboard login and shows the requesting origin/project; approving creates a widget session and parks the raw token on the request row. The widget polls `…/auth/requests/<id>/poll` with the secret every 1.5 s for up to 10 minutes; the token is returned exactly once and the row deleted. Expired approved-but-unclaimed requests delete their session during hourly maintenance. Nothing depends on `window.opener`/`postMessage`, so COOP-isolated host pages and blocked popups (fallback link) both work.

First admin: `/setup` (only while `users` is empty) or `NOTETTE_ADMIN_EMAIL`/`PASSWORD` bootstrap (`src/lib/server/auth/bootstrap.ts`, never modifies existing users). Roles: `owner` may manage users; the last owner cannot be demoted or deleted.

## Widget API

All widget traffic goes through `/api/widget/[clientKey]/…`. `src/hooks.server.ts` (`widgetApi` handle) resolves the project by key, determines the request origin (`Origin` header, falling back to `Referer`), matches it against the project's allow-list (`src/lib/server/origins.ts`: exact origins, `*` wildcards for host labels/ports, or a lone `*`), answers `OPTIONS` preflights, rejects unknown keys / disallowed origins with JSON errors (CORS headers are added to those error responses so the widget can log a useful message), and sets `event.locals.widget = { project, origin }` plus `locals.user` for valid bearer tokens. Success responses get `Access-Control-Allow-Origin: <origin>`; credentials are never allowed. New request headers used by the widget must be added to `Access-Control-Allow-Headers` in `src/lib/server/widget-cors.ts`.

Routes (`src/routes/api/widget/[key]/`):

- `GET config` — project flags, viewer (when the bearer token is valid), dashboard base URL.
- `GET feedback?scope=page&path=…` (reviewers, if `publicFeedbackVisible`) / `scope=project&status&q` (admins only); `POST feedback` creates an item (zod schema `feedbackCreateSchema` in `validation.ts`; page URL must belong to an allowed origin) and returns the detail DTO plus a one-time `uploadToken` when screenshots are enabled.
- `GET|PATCH|DELETE feedback/[id]` — detail; status change and delete require an admin. `POST feedback/[id]/comments` — reply (reviewers only if `reviewerRepliesEnabled`).
- `PUT feedback/[id]/screenshot` — raw image body (PNG/JPEG/WebP sniffed from magic bytes, size capped by `NOTETTE_MAX_SCREENSHOT_BYTES`), authorised by `X-Notette-Upload-Token` within 15 minutes of creation or by an admin token; `GET` streams it for the widget (image tags cannot send bearer tokens, so the widget fetches a blob).
- `auth/requests`, `auth/requests/[id]/poll`, `DELETE auth/session` — see *Authentication*.

Visibility rule used everywhere (`src/lib/server/widget-thread.ts`): admins see everything; reviewers see a project's feedback only when `publicFeedbackVisible` is on. `/uploads/[id]` (dashboard screenshot URLs, also used in Copy for Agent) follows the same rule using the dashboard cookie.

Rate limits (`src/lib/server/rate-limit.ts`, in-memory per process) apply to anonymous feedback creation, replies, auth request creation/polling and dashboard login. API handlers are wrapped in `api()` from `http.ts` so `ApiError`/zod errors become JSON `{ error: { message, code, details } }`.

## Storage

`src/lib/server/storage/index.ts` defines `StorageAdapter { put, open, delete }`; `local.ts` implements it on `NOTETTE_UPLOADS_DIR` with atomic writes and key validation (`projects/<projectId>/<uploadId>.<ext>`). `services/uploads.ts` is the only module that touches storage; deleting feedback or projects removes files best-effort before deleting rows. An S3 adapter would implement the same interface and be selected in `getStorage()`.

## Dashboard

Route groups: `(auth)` (login, setup), `(app)` (everything requiring a session; `+layout.server.ts` redirects to `/login?redirect=` and loads the project list for the sidebar), `(popup)` (minimal layout for the widget authorize page), plus `logout`, `uploads/[id]`, `notette.js`, `api/health`. All mutations are SvelteKit form actions with `use:enhance`, so SvelteKit's origin check provides CSRF protection; there are no cookie-authenticated JSON endpoints. Pages return plain serialisable data (dates as ISO strings; feedback rows mapped with `toSummaryDto`/`toDetailDto` from `services/feedback.ts`).

Pages: overview (`/`), cross-project list (`/feedback`, filters via query string, 25 per page), project list/settings/try (`/projects/[id]`, `/settings`, `/try`), feedback detail with thread, context panels, screenshot, resolve/reopen/delete and Copy for Agent (`/projects/[id]/feedback/[fid]`), account (profile, password, sessions), users (owner-managed). Shared components live in `src/lib/components/`; styling is plain CSS in `src/app.css` with light/dark tokens and a responsive shell (sidebar collapses under 900 px).

The *Try it* page loads the real widget from the instance's own origin (which must be in the project's allow-list; the page offers to add it) so the full flow can be exercised without deploying. Dashboard pages carry a CSP (`svelte.config.js`): scripts and connections only from self, inline styles allowed (the widget injects styles into its shadow root), images from self/data/blob.

## Widget

Source: `src/widget/`. Built separately by `vite.widget.config.ts` into a single IIFE bundle `.widget-dist/notette.js` (Svelte 5 components compiled with `css: 'external'`; the `inlineCss` plugin replaces the `__NOTETTE_CSS__` placeholder in `index.ts` with all emitted CSS). `src/routes/notette.js/+server.ts` imports that file with `?raw` and serves it with an ETag, short cache and `Access-Control-Allow-Origin: *`, so the bundle ships inside the SvelteKit build with no separate static hosting. `pnpm run build`/`pnpm run dev` always build the widget first; `pnpm run dev:widget` rebuilds on change.

Runtime structure:

- `index.ts` — reads config from the `<script>` tag (`data-key`, `data-host`, `data-environment|branch|commit|deployment-url`, `data-position`, `data-open`, `data-auto-init`) or `Notette.init(options)`; creates a single `<notette-widget>` host element (`all: initial; position: fixed; z-index` max) appended to `document.body`, attaches an open shadow root with the CSS and mounts `App.svelte` with the controller passed through `mount({ context })`. Exposes `window.Notette` (`init`, `destroy`, `open`, `close`, `comment`, `list`, `focus`) and dispatches `notette:ready`.
- `lib/controller.svelte.ts` — `WidgetController` owns all state (`ui`, a `$state` object) and side effects: config load, page item loading, picking/composing, submit (context capture + screenshot + create + upload), threads/replies/status/delete, panel navigation, focus handling (`?notette=<id>` or `sessionStorage['notette:focus']`), the admin sign-in flow and sign-out, toasts. Components get it via `getContext('notette')`.
- `lib/dom.ts` — selector generation (unique id → test-id attributes → short class paths ignoring generated-looking class names → nth-of-type fallback; always verified with `querySelector`), XPath, privacy-conscious element description (no input values), `locateElement` (selector, disambiguated by text, then XPath) and `pinPosition` (element rect × stored relative offset, falling back to recorded page coordinates flagged `approximate`).
- `lib/screenshot.ts` — html2canvas viewport capture (scale capped to ~4 MP, JPEG 0.85, click marker drawn on the image, 12 s timeout, widget host excluded). Never throws; `null` means "submit without screenshot".
- `lib/api.ts` — fetch wrapper for the widget API (`credentials: 'omit'`, bearer token when signed in). `lib/config.ts`, `lib/storage.ts`, `lib/position.ts` are small helpers.
- Components: `Launcher` (bubble → toolbar: Comment, Pins, List, Admin/avatar, close), `Picker` (full-viewport overlay using `document.elementsFromPoint`, hover highlight + label, Esc cancels), `Composer` (anchored popover; name/email for reviewers, screenshot toggle, Ctrl/⌘+Enter), `Pins` (fixed layer recomputed on scroll/resize/ResizeObserver/`layoutTick`; outline of the selected element), `Thread` (anchored to the pin; replies, screenshot thumbnail loaded as a blob, admin actions, Copy for Agent, dashboard link), `Panel` (sidebar list; reviewers see the current page, admins can switch to all pages with status/search filters; selecting an item scrolls to and opens it, or navigates to its page and focuses it on arrival), `AuthDialog`, `Toast`.

Non-interference rules (keep them when changing the widget): only one host element is added to the page; no global CSS; host-page events are only intercepted while the picker overlay is active (plus a capture-phase Escape handler in that mode); the widget never patches `history`, `fetch` or other globals — SPA navigations are detected via `popstate`/`hashchange`, a debounced MutationObserver and a 1 s path check; `scrollIntoView`/`scrollTo` are only called when the user explicitly focuses an item. All state is namespaced in `localStorage` under `notette:<key>:…` (token, pin visibility) and `notette:author`.

Feedback DTOs are shared through `src/lib/shared/types.ts`; the widget must never import from `src/lib/server`.

## Copy for Agent

`src/lib/shared/agent-format.ts` renders a `FeedbackDetailDto` (plus optional project name and dashboard link) as Markdown: quoted comment and author, replies, page (URL, path, title, viewport, scroll), target element (tag with attributes, text, selector, XPath, bounding box, click position relative to the element), deployment fields, metadata JSON, screenshot/dashboard links and user agent. Empty sections are omitted. Used by the widget thread header and the dashboard detail page; tested in `agent-format.test.ts`.

## Docker and CI

`Dockerfile`: multi-stage using pnpm via corepack (`deps`: `pnpm install --frozen-lockfile --prod=false` → `build`: `pnpm run build` → `prod-deps`: a clean `pnpm install --prod --ignore-scripts` → slim runtime with `tini`, non-root `node` user, `/data/uploads` volume, healthcheck on `/api/health`). `docker-entrypoint.sh` derives `ORIGIN` from `NOTETTE_URL`. `docker-compose.yml` runs `db` (postgres:16-alpine, volume `notette-db`) and `app` (image `ghcr.io/blunderworks/notette`, `build: .` for local builds, volume `notette-uploads`). `.github/workflows/ci.yml` runs check/test/build and a Docker build on pushes and PRs; `release.yml` publishes multi-arch images on `v*.*.*` tags with semver + `latest` tags.
