# Notette

Self-hosted, framework-agnostic preview feedback. Drop one `<script>` tag into any site and reviewers can click an element, leave a comment, and see existing feedback as pins on the page. Admins triage from the same widget or from a lightweight dashboard. Everything runs from a single Docker image plus PostgreSQL; there are no external services.

- **Widget**: standalone browser bundle served by your Notette instance, rendered in a Shadow DOM so it never touches the host page's styles or behaviour.
- **Context captured**: URL, page title, viewport, scroll position, click position, CSS selector + XPath, element text/attributes, bounding box, user agent, viewport screenshot (never blocks submission), plus optional deployment metadata (environment, branch, commit, URL).
- **Threads**: replies, open/resolved status, admin badges.
- **On-site admin**: sign in from the widget (inline email/password, or approve from the dashboard; no third-party cookies), resolve/reopen/delete, browse feedback across all pages of a project and jump straight to each pin.
- **Access control**: allow anonymous feedback, or require an account. Member accounts can be assigned to specific projects, or a project can be opened for self-service signups from the widget. Optional Cloudflare Turnstile protects anonymous submissions and sign-in/sign-up.
- **Notifications and mentions** (optional, needs SMTP): admins and thread participants get a nicely formatted email about new feedback, replies and @-mentions, grouped per recipient and sent about a minute after the first update, with a link that opens the thread on the site. Everyone can turn it off per project; projects can require sign-ups to confirm their email address.
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
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | — | Optional Cloudflare Turnstile keys. When both are set, anonymous feedback and replies, widget sign-in/sign-up and the dashboard login require a challenge; unset means no bot protection |
| `SMTP_HOST` / `EMAIL_FROM` | — | Optional outgoing email. When both are set, email notifications and email verification become available; unset means no email is ever sent |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | `587` / auto / — / — | SMTP details. `SMTP_SECURE=true` uses implicit TLS (default for port 465); otherwise STARTTLS is used when the server offers it. User/password are optional for relays without authentication |
| `NOTETTE_EMAIL_BATCH_SECONDS` | `60` | How long activity is collected per recipient before one digest email goes out |
| `PORT` / `HOST` / `BODY_SIZE_LIMIT` | `3000` / `0.0.0.0` / `12M` | Node server settings |

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of port 3000 and set `NOTETTE_URL` to the public HTTPS URL. The container derives `ORIGIN` from `NOTETTE_URL` automatically. Health check: `GET /api/health`.

## Persistence and backups

Two Docker volumes hold all state:

- `notette-db` — PostgreSQL data (projects, users, feedback, comments, sessions)
- `notette-uploads` — screenshots (`/data/uploads` inside the app container)

The app process runs as the unprivileged `node` user. On start the container fixes ownership of the uploads directory, so a root-owned bind mount (e.g. `./data/uploads:/data/uploads`) works without a manual `chown`.

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
- **Users and roles**: *Settings → Users*. Owners can add/remove users and change roles; admins can do everything else (manage projects, triage feedback, act as admin in the widget). **Members** are regular accounts for reviewers: they can only sign in to the widget on projects they belong to (added under the project's settings, or by signing up on a project that is open for signups) and see a minimal dashboard with their projects and account page. Admins can also create member accounts directly from a project's *Members* card.
- **Bot protection**: set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile, free) to require a challenge for anonymous feedback and replies, widget sign-in/sign-up and the dashboard login. Without the keys nothing changes. The challenge renders on the page the user is looking at, so in the Cloudflare dashboard (*Turnstile → your widget → Hostname management*) add **this instance's hostname** (for the dashboard login) and **every site that embeds the widget**, plus `localhost` for local testing; subdomains are covered by their parent domain. A hostname that is missing shows up as Turnstile error `110200` in the browser console and in the widget's error message. Sites embedding the widget must also allow `https://challenges.cloudflare.com` in `script-src` and `frame-src` if they set a Content Security Policy.
- **Email notifications**: set `SMTP_HOST` and `EMAIL_FROM` (see the table above). Owners and admins are emailed about every new feedback item and reply; signed-in members are emailed about replies in threads they took part in and whenever someone @-mentions them. Updates are grouped per person and sent as one email about a minute after the first one, each with an *Open on site* link that opens the thread in the widget (admins also get a dashboard link). Anyone can turn emails off per project: admins under *Project settings → Your notifications*, everyone from the account menu in the widget (click the avatar). Unconfirmed accounts are never emailed.
- **Checking the email setup**: open *Account* in the dashboard and use **Send test email** (admins only). It sends a message to your own address and shows the SMTP server's reply, or the exact error (authentication rejected, connection refused, TLS failure, …) when sending fails. The same card lists the configured server and sender, or tells you which variable is still missing.
- **Email verification**: with email configured, a project can *Require email verification for signups*. Accounts created from the widget then receive a confirmation link (valid 24 hours) and cannot sign in until they open it; the sign-in forms offer *Resend confirmation email*, and owners can *Mark verified* on the Users page if a message never arrives. Accounts created by admins are always verified.
- **Password reset** when locked out: `docker compose exec app node scripts/reset-password.mjs you@example.com 'new-password'` (creates the account if it does not exist).
- **Sessions**: *Settings → Account* lists dashboard and widget sessions with the site origin each widget token was issued to, and lets you revoke them. Changing your password signs out all other sessions.
- **Security defaults**: scrypt password hashing, httpOnly SameSite cookies, CSRF-protected forms, CSP on dashboard pages, per-project origin allow-lists, bearer tokens bound to one project and origin, rate limiting on submissions and sign-in, screenshot uploads authorised by a one-time token, magic-byte validation of images.

## Project setup

1. *New project* in the dashboard. Give it a name and the **allowed origins** of the sites that embed the widget, one per line. Wildcards are supported for preview deployments, e.g. `https://*.vercel.app`, `https://*-myteam.vercel.app` or `http://localhost:*`. A lone `*` allows any origin.
2. Settings per project:
   - *Reviewers can see existing feedback* — show pins, threads and screenshots to reviewers (anonymous visitors and signed-in members; default on). Turn off for sensitive sites; admins always see everything.
   - *Reviewers can reply to threads*.
   - *Capture screenshots*.
   - *Allow anonymous feedback* (default on) — anyone on the site can use the widget. Turn it off to require an account: the widget then opens a small sign-in form instead of the toolbar.
   - *Open for signups* (default off) — visitors can create a member account from the widget, and any signed-in account joins the project on first use. When off, only members listed in the project's *Members* card (plus owners and admins) can sign in on that project.
   - *Require email verification for signups* (default off, needs SMTP) — widget sign-ups must confirm their email address before they can sign in.
   - *Your notifications* (needs SMTP) — your personal switch for email notifications about this project.
3. **Members**: the *Members* card on the settings page lists who has access, lets you add existing member accounts or create new ones, and remove them (removal also revokes their widget sessions for that project).
4. The **client key** (`ntk_…`) is a public identifier, not a secret; the origin allow-list is what protects the API. Regenerate it from the settings page if needed.

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
- On projects that do not allow anonymous feedback, clicking the launcher opens a small **sign-in** form instead (with a **create account** option when the project is open for signups; if the project requires email verification the widget asks the new user to open the emailed link first). Members post under their account name; admins get the full toolbar. Clicking the avatar opens the account menu with the email notification switch and sign out.
- Admins and members can also choose **Sign in** in the launcher at any time. The form signs in with the Notette email and password directly; alternatively, *Approve from the Notette dashboard* opens a Notette window that asks to approve access for that site and the widget polls for the approval (works across origins, with popup blockers and on COOP-isolated pages). Either way the resulting token lives only in that site's `localStorage` and is bound to that project and origin. Admins can resolve, reopen, delete, and use **List → All pages** to browse the whole project; selecting an item navigates to its page and highlights the pin.
- Deep links: append `?notette=<feedback id>` to a page URL (the dashboard's *Open on site* button does this) to focus a specific item on load.
- **Mentions**: signed-in users can type `@` in a comment or reply to mention someone. Admins can mention project members and other admins/owners; members can mention people on the same project. Mentioned people are emailed (when notifications are configured and enabled) and the name is highlighted in the thread.
- **Copy for Agent** (widget thread header or dashboard detail page) copies the item plus its context as Markdown.

Pins are re-anchored to the original element by CSS selector, falling back to XPath, and finally to the recorded page coordinates (shown as a dashed "approximate" pin) when the element no longer exists.

## Releasing

Two separate pushes are involved:

- Pushing **`main`** runs the `CI` workflow (check, test, build). It does not publish anything.
- Pushing a **`vX.Y.Z` tag** runs the `Release` workflow, which type-checks, tests, builds, and publishes `ghcr.io/blunderworks/notette` with `X.Y.Z`, `X.Y`, `X` and `latest` tags for `linux/amd64` and `linux/arm64`. The image is built from the commit the tag points at, whether or not that commit is on `origin/main`.

Do this every time you cut a release:

```bash
# 1. Make sure everything is committed and verified locally
git status                       # working tree must be clean
pnpm run check && pnpm test && pnpm run build

# 2. Bump the version in package.json to match the tag you are about to create
pnpm version 0.1.4 --no-git-tag-version
git add package.json
git commit -m "Bump to 0.1.4"

# 3. Push the branch first, then the tag
git push origin main
git tag v0.1.4
git push origin v0.1.4

# 4. Watch the Release workflow on GitHub (Actions tab) until it goes green
```

Notes:

- `git push` on its own never pushes tags, and `git push origin v0.1.4` never pushes the branch. Pushing only the tag publishes an image from a commit that is not on `origin/main`; pushing only the branch publishes nothing. Always do both, branch first.
- `git push --follow-tags` pushes `main` and any annotated tags on it in one command; it skips lightweight tags, so create the tag with `git tag -a v0.1.4 -m "v0.1.4"` if you want to rely on it.
- To see what is unpushed: `git status` reports "Your branch is ahead of 'origin/main'", and `git ls-remote --tags origin` lists which tags GitHub already has.
- A tag with a `-` in it (for example `v0.2.0-rc.1`) publishes the semver tags but not `latest`.
- If a release run failed, fix `main`, then move the tag: `git tag -f v0.1.4 && git push --force origin v0.1.4`. Only do this for a tag that never produced a usable image.

## License

MIT
