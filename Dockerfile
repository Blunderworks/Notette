# syntax=docker/dockerfile:1

# ---- base -------------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
# pnpm version comes from the "packageManager" field in package.json.
RUN corepack enable pnpm

# ---- dependencies (including dev, needed to build) --------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm run build

# ---- production dependencies only -------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
RUN apk add --no-cache tini
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
	&& mkdir -p /data/uploads \
	&& chown -R node:node /data /app

USER node
ENV PORT=3000 \
	HOST=0.0.0.0 \
	BODY_SIZE_LIMIT=12M \
	NOTETTE_UPLOADS_DIR=/data/uploads \
	NOTETTE_MIGRATIONS_DIR=/app/drizzle

EXPOSE 3000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "build"]
