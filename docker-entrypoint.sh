#!/bin/sh
set -e

# SvelteKit's node adapter needs ORIGIN to build absolute URLs and to validate
# form submissions. Derive it from NOTETTE_URL unless set explicitly.
if [ -z "${ORIGIN:-}" ] && [ -n "${NOTETTE_URL:-}" ]; then
	export ORIGIN="$NOTETTE_URL"
fi

exec "$@"
