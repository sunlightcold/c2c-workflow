# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY libs/build/package.json ./libs/build/package.json
COPY server/backend/package.json ./server/backend/package.json
COPY server/mock/package.json ./server/mock/package.json

RUN --mount=type=cache,id=c2c-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY libs ./libs
COPY server ./server

RUN pnpm --filter ./server/backend deploy --prod --legacy /runtime \
  && test -d /runtime/node_modules \
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

COPY --chown=node:node --from=dependencies /runtime/node_modules ./node_modules
COPY --chown=node:node volumes/apps ./dist/apps
COPY --chown=node:node --from=dependencies /runtime/initJson ./initJson
COPY --chown=node:node volumes/config/production.js ./config/production.js

RUN mkdir -p /app/logs /app/dist/apps/static \
  && chown node:node /app/logs /app/dist/apps/static

USER node

EXPOSE 3000

CMD ["node", "dist/apps/admin/main.js"]
