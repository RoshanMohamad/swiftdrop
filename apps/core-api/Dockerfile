# core-api: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/core-api/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Optional npm mirror: docker compose build --build-arg NPM_REGISTRY=https://registry.yarnpkg.com
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
RUN echo "registry=${NPM_REGISTRY}" > /root/.npmrc
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter core-api...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && pnpm --filter core-api build \
 && pnpm --filter core-api deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /app
# loadConfig() finds the workspace root by walking up to pnpm-workspace.yaml.
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/contracts/openapi.json ./packages/contracts/openapi.json
COPY --from=build /out ./apps/core-api
COPY deploy/docker/init-secrets.mjs ./scripts/init-secrets.mjs
# .local/services is where `services-cli provision` writes the notification-svc signing key.
RUN mkdir -p /app/.local/services && chown -R node:node /app/.local
WORKDIR /app/apps/core-api
USER node
EXPOSE 3000 3001
CMD ["node", "dist/server.js"]
