#!/bin/sh
set -e

# SvelteKit's node adapter needs ORIGIN to build absolute URLs and to validate
# form submissions. Derive it from NOTETTE_URL unless set explicitly.
if [ -z "${ORIGIN:-}" ] && [ -n "${NOTETTE_URL:-}" ]; then
	export ORIGIN="$NOTETTE_URL"
fi

# The image starts as root so it can repair ownership of the uploads volume
# (a bind mount or a volume created by an older image is root-owned, which
# gives the app EACCES on mkdir) and then drops to the unprivileged "node"
# user. When the container is started with --user, run as that user as-is.
if [ "$(id -u)" = "0" ]; then
	uploads="${NOTETTE_UPLOADS_DIR:-/data/uploads}"
	mkdir -p "$uploads"
	if [ "$(stat -c '%u' "$uploads")" != "$(id -u node)" ]; then
		chown -R node:node "$uploads"
	fi
	exec su-exec node "$@"
fi

exec "$@"
