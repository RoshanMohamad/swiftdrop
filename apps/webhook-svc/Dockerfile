# webhook-svc: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/webhook-svc/Dockerfile .
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
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; \
    pnpm install --frozen-lockfile --filter webhook-svc...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && pnpm --filter webhook-svc build \
 && pnpm --filter webhook-svc deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0
RUN apk add --no-cache openssl
WORKDIR /app
# Shared kernel helpers locate the workspace root by walking up to pnpm-workspace.yaml.
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /out ./apps/webhook-svc
WORKDIR /app/apps/webhook-svc
USER node
EXPOSE 3102
CMD ["node", "dist/server.js"]
