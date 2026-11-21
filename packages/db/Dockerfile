# db: one-shot migration image (`prisma migrate deploy`). Run as a compose job or Helm hook.
# It needs the Prisma CLI, so unlike the service images it keeps this package's dev dependencies.
# The demo seed (tsx src/seed.ts) is included but refuses to run anywhere except a local
# disposable database named swiftdrop on localhost.
# Build context is the repository root:  docker build -f packages/db/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS runtime
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
# "--filter ." adds the workspace root so tsx (used by the seed) is installed too.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; \
    pnpm install --frozen-lockfile --filter @swiftdrop/db... --filter .
RUN if [ "$PNPM_FAST_INSTALL" = true ]; then export pnpm_config_minimum_release_age=0 pnpm_config_trust_policy=off; fi; DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && chown -R node:node /app
USER node
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
