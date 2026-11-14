# outbox-relay: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/outbox-relay/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter outbox-relay...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && pnpm --filter outbox-relay build \
 && pnpm --filter outbox-relay deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0
RUN apk add --no-cache openssl
WORKDIR /app
# Shared kernel helpers locate the workspace root by walking up to pnpm-workspace.yaml.
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /out ./apps/outbox-relay
WORKDIR /app/apps/outbox-relay
USER node
EXPOSE 3101
CMD ["node", "dist/server.js"]
