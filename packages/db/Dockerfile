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
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
# "--filter ." adds the workspace root so tsx (used by the seed) is installed too.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @swiftdrop/db... --filter .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && chown -R node:node /app
USER node
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
