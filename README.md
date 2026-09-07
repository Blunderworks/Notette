# Notette

Self-hosted, framework-agnostic preview feedback. Drop one `<script>` tag into any site and reviewers can click an element, leave a comment, and see existing feedback as pins on the page. Admins triage from the same widget or from a lightweight dashboard. Everything runs from a single Docker image plus PostgreSQL; there are no external services.

- **Widget**: standalone browser bundle served by your Notette instance, rendered in a Shadow DOM so it never touches the host page's styles or behaviour.
- **Context captured**: URL, page title, viewport, scroll position, click position, CSS selector + XPath, element text/attributes, bounding box, user agent, viewport screenshot (never blocks submission), plus optional deployment metadata (environment, branch, commit, URL).
- **Threads**: replies, open/resolved status, admin badges.
- **On-site admin**: sign in from the widget (popup + polling, no third-party cookies), resolve/reopen/delete, browse feedback across all pages of a project and jump straight to each pin.
- **Dashboard**: cross-project overview, search/filter, thread view with full context, project settings and embed snippet, users and sessions.
- **Copy for Agent**: one click copies the feedback with page, DOM, deployment and screenshot context as concise Markdown for a coding agent.

## Quick start (Docker Compose)

```bash
git clone https://github.com/blunderworks/notette.git && cd notette
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and NOTETTE_URL (the public URL of this instance)
docker compose pull      # uses ghcr.io/blunderworks/notette:latest
docker compose up -d
```

Open `NOTETTE_URL` and create the first admin at `/setup` (or set `NOTETTE_ADMIN_EMAIL` / `NOTETTE_ADMIN_PASSWORD` in `.env` before the first start). Then create a project, add your site's origin, and paste the embed snippet.

To build the image locally instead of pulling it, run `docker compose up -d --build`.

## Local development

Prerequisites: Node 22+, pnpm 10 (`corepack enable pnpm` picks the version pinned in `package.json`), and a PostgreSQL 14+ instance (Docker is the easiest).

```bash
docker run -d --name notette-db -e POSTGRES_PASSWORD=notette -e POSTGRES_USER=notette -e POSTGRES_DB=notette -p 5432:5432 postgres:16-alpine
cp .env.example .env         # set DATABASE_URL=postgres://notette:notette@localhost:5432/notette
pnpm install
pnpm run dev                  # builds the widget once, then starts SvelteKit on http://localhost:5173
pnpm run dev:widget           # optional, in a second terminal: rebuild the widget on change
```

Migrations run automatically at startup. Useful commands:

| Command | Purpose |
| --- | --- |
| `pnpm run check` | Type-check the app and widget (svelte-check) |
| `pnpm test` | Unit tests (vitest) |
| `pnpm run build` | Production build (widget + SvelteKit) into `build/` |
| `pnpm run db:generate` | Generate a new SQL migration after editing `src/lib/server/db/schema.ts` |
| `pnpm run db:migrate` | Apply migrations manually (they also run at startup) |

The dashboard has a **Try it** tab on every project that loads the real widget on a sample page, which is the quickest way to exercise the whole flow locally.

## Production deployment

The published image is `ghcr.io/blunderworks/notette` (tags: `latest`, `1`, `1.2`, `1.2.3`). `docker-compose.yml` runs it next to PostgreSQL with two named volumes.

Configuration is entirely through environment variables (see `.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `NOTETTE_URL` | — | Public base URL, e.g. `https://feedback.example.com`. Used for embed snippets, the admin sign-in popup, secure cookies and CSRF checks |
| `NOTETTE_ADMIN_EMAIL` / `NOTETTE_ADMIN_PASSWORD` / `NOTETTE_ADMIN_NAME` | — | Create this admin on startup if it does not exist |
| `NOTETTE_UPLOADS_DIR` | `/data/uploads` (image) | Screenshot storage directory |
| `NOTETTE_MAX_SCREENSHOT_BYTES` | `8388608` | Maximum screenshot upload size |
| `NOTETTE_SESSION_DAYS` | `30` | Session lifetime (sliding) |
| `NOTETTE_AUTO_MIGRATE` | `true` | Apply migrations at startup |
| `ADDRESS_HEADER` / `XFF_DEPTH` | — | Set `ADDRESS_HEADER=x-forwarded-for` behind a reverse proxy so rate limiting sees real client IPs |
| `PORT` / `HOST` / `BODY_SIZE_LIMIT` | `3000` / `0.0.0.0` / `12M` | Node server settings |

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of port 3000 and set `NOTETTE_URL` to the public HTTPS URL. The container derives `ORIGIN` from `NOTETTE_URL` automatically. Health check: `GET /api/health`.

## Persistence and backups

Two Docker volumes hold all state:

- `notette-db` — PostgreSQL data (projects, users, feedback, comments, sessions)
- `notette-uploads` — screenshots (`/data/uploads` inside the app container)

Back up both:

```bash
docker compose exec -T db pg_dump -U notette -d notette --format=custom > notette-$(date +%F).dump
docker run --rm -v notette_notette-uploads:/data -v "$PWD":/backup alpine tar czf /backup/notette-uploads-$(date +%F).tgz -C /data .
```

Restore:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U notette -d notette --clean --if-exists < notette-2026-01-01.dump
docker run --rm -v notette_notette-uploads:/data -v "$PWD":/backup alpine sh -c "cd /data && tar xzf /backup/notette-uploads-2026-01-01.tgz"
docker compose up -d
```

(The volume prefix `notette_` is the compose project name; check `docker volume ls`.) The storage layer is abstracted (`src/lib/server/storage`), so an S3-compatible adapter can be added without touching the rest of the app.

## Administration

- **First admin**: `/setup` is available only while no users exist; alternatively set `NOTETTE_ADMIN_EMAIL` and `NOTETTE_ADMIN_PASSWORD`.
- **Users**: *Settings → Users*. Owners can add/remove users and change roles; admins can do everything else (manage projects, triage feedback, act as admin in the widget).
- **Password reset** when locked out: `docker compose exec app node scripts/reset-password.mjs you@example.com 'new-password'` (creates the account if it does not exist).
- **Sessions**: *Settings → Account* lists dashboard and widget sessions with the site origin each widget token was issued to, and lets you revoke them. Changing your password signs out all other sessions.
- **Security defaults**: scrypt password hashing, httpOnly SameSite cookies, CSRF-protected forms, CSP on dashboard pages, per-project origin allow-lists, bearer tokens bound to one project and origin, rate limiting on submissions and sign-in, screenshot uploads authorised by a one-time token, magic-byte validation of images.

## Project setup

1. *New project* in the dashboard. Give it a name and the **allowed origins** of the sites that embed the widget, one per line. Wildcards are supported for preview deployments, e.g. `https://*.vercel.app`, `https://*-myteam.vercel.app` or `http://localhost:*`. A lone `*` allows any origin.
2. Settings per project:
   - *Reviewers can see existing feedback* — show pins, threads and screenshots to anyone on the site (default on). Turn off for sensitive sites; admins always see everything.
   - *Reviewers can reply to threads*.
   - *Capture screenshots*.
3. The **client key** (`ntk_…`) is a public identifier, not a secret; the origin allow-list is what protects the API. Regenerate it from the settings page if needed.

## Embedding the widget

Add the snippet from *Settings & embed* to every page (typically the root layout):

```html
<script src="https://feedback.example.com/notette.js" data-key="ntk_yourkey" defer></script>
```

Optional `data-*` attributes: `data-environment`, `data-branch`, `data-commit`, `data-deployment-url`, `data-position="bottom-left"`, `data-open="true"`, `data-host` (override the API base URL), `data-auto-init="false"`.

Programmatic setup (for deployment metadata from your build, or a known reviewer identity):

```html
<script src="https://feedback.example.com/notette.js" data-auto-init="false" defer></script>
<script>
  function setupNotette() {
    Notette.init({
      key: 'ntk_yourkey',
      deployment: { environment: 'preview', branch: 'feat/x', commit: 'abc1234', url: location.origin },
      user: { name: 'Jane Reviewer', email: 'jane@example.com' },
      metadata: { appVersion: '1.4.2' }
    });
  }
  if (window.Notette) setupNotette();
  else window.addEventListener('notette:ready', setupNotette, { once: true });
</script>
```

On Vercel, for example, expose `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA` and `VERCEL_URL` to the client and pass them as the deployment fields.

The `window.Notette` API also offers `open()`, `close()`, `comment()` (start picking an element), `list()`, `focus(id)` and `destroy()`.

Using it:

- Reviewers click the launcher, choose **Comment**, click any element, and write the note. The widget records the element and page context, captures a screenshot (if enabled) and submits. Pins show existing feedback; clicking one opens the thread.
- Admins choose **Admin** in the launcher. A Notette window opens (sign in if needed) and asks to approve access for that site; the widget then polls for the approval, so it works across origins and with popup blockers or COOP-isolated pages. The resulting token lives only in that site's `localStorage` and is bound to that project and origin. Admins can resolve, reopen, delete, and use **List → All pages** to browse the whole project; selecting an item navigates to its page and highlights the pin.
- Deep links: append `?notette=<feedback id>` to a page URL (the dashboard's *Open on site* button does this) to focus a specific item on load.
- **Copy for Agent** (widget thread header or dashboard detail page) copies the item plus its context as Markdown.

Pins are re-anchored to the original element by CSS selector, falling back to XPath, and finally to the recorded page coordinates (shown as a dashed "approximate" pin) when the element no longer exists.

## Releasing

Push a tag like `v1.2.3`. The `Release` workflow type-checks, tests, builds, and publishes `ghcr.io/blunderworks/notette` with `1.2.3`, `1.2`, `1` and `latest` tags for `linux/amd64` and `linux/arm64`.

## License

MIT
