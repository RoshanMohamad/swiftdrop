# webhook-svc: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/webhook-svc/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter webhook-svc...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
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
