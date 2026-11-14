# outbox-relay: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/outbox-relay/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Optional npm mirror: docker compose build --build-arg NPM_REGISTRY=https://registry.yarnpkg.com
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
RUN echo "registry=${NPM_REGISTRY}" > /root/.npmrc
# Opt-in: skip pnpm 11's release-age and provenance lookups (hundreds of metadata requests) for
# --frozen-lockfile installs on slow networks. The lockfile still pins every version and integrity hash.
#   docker compose build --build-arg PNPM_FAST_INSTALL=true
ARG PNPM_FAST_INSTALL=false
RUN for i in 1 2 3 4 5; do apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate && break; [ "$i" = 5 ] && exit 1; sleep 5; done
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; \
    pnpm install --frozen-lockfile --filter outbox-relay...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && pnpm --filter outbox-relay build \
 && pnpm --filter outbox-relay deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0
RUN for i in 1 2 3 4 5; do apk add --no-cache openssl && break; [ "$i" = 5 ] && exit 1; sleep 5; done
WORKDIR /app
# Shared kernel helpers locate the workspace root by walking up to pnpm-workspace.yaml.
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /out ./apps/outbox-relay
WORKDIR /app/apps/outbox-relay
USER node
EXPOSE 3101
CMD ["node", "dist/server.js"]
