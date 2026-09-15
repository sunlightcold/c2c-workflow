# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV FORK_TS_CHECKER_MEMORY_LIMIT=4096

RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY libs ./libs
COPY server ./server

RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./server/backend exec nest build \
      --builder webpack \
      --webpackPath webpack.build.config.js \
      admin \
  && mkdir -p /build-artifacts/apps \
  && cp -R /workspace/server/backend/dist/apps/admin /build-artifacts/apps/admin \
  && pnpm --filter ./server/backend exec nest build \
      --builder webpack \
      --webpackPath webpack.build.config.js \
      migrate \
  && cp -R /workspace/server/backend/dist/apps/migrate /build-artifacts/apps/migrate \
  && pnpm --filter ./server/backend exec tsc \
      config/production.ts \
      --target ES2022 \
      --module CommonJS \
      --moduleResolution Node \
      --esModuleInterop \
      --skipLibCheck \
      --outDir /runtime-config
RUN pnpm --filter ./server/backend deploy --prod --legacy /runtime \
  && mkdir -p /runtime/initJson \
  && if [ -d /workspace/server/backend/initJson ]; then \
       cp -R /workspace/server/backend/initJson/. /runtime/initJson/; \
     fi

FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/app/config
ENV NODE_OPTIONS=--enable-source-maps

WORKDIR /app

COPY --chown=node:node --from=builder /runtime/node_modules ./node_modules
COPY --chown=node:node --from=builder /build-artifacts/apps ./dist/apps
COPY --chown=node:node --from=builder /runtime/initJson ./initJson
COPY --chown=node:node --from=builder /runtime-config/production.js ./config/production.js

RUN mkdir -p /app/logs /app/dist/apps/static \
  && chown node:node /app/logs /app/dist/apps/static

USER node

EXPOSE 3000

CMD ["node", "dist/apps/admin/main.js"]
