# syntax=docker/dockerfile:1

ARG C2C_RUNTIME_IMAGE=c2c-workflow-backend-runtime:local
FROM ${C2C_RUNTIME_IMAGE} AS runner

COPY --chown=node:node image/app/ ./
