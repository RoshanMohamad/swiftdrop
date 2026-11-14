# notification-svc: multi-stage build. The runtime image holds compiled JS and production dependencies only.
# Build context is the repository root:  docker build -f apps/notification-svc/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter notification-svc...
# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @swiftdrop/db generate \
 && pnpm --filter notification-svc build \
 && pnpm --filter notification-svc deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0
RUN apk add --no-cache openssl
WORKDIR /app
# Shared kernel helpers locate the workspace root by walking up to pnpm-workspace.yaml.
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /out ./apps/notification-svc
# The signing key written by `services-cli provision` lives on a shared volume here.
RUN mkdir -p /app/.local/services && chown -R node:node /app/.local
WORKDIR /app/apps/notification-svc
USER node
EXPOSE 3103
CMD ["node", "dist/server.js"]
