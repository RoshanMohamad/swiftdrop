# syntax=docker/dockerfile:1
FROM node:24.11-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /workspace
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter notification-svc...
RUN pnpm --filter @swiftdrop/db generate
RUN pnpm --filter notification-svc build
RUN pnpm --filter notification-svc deploy --prod --legacy /runtime

FROM node:24.11-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/package.json ./package.json
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/notification-svc/dist ./dist

USER node
CMD ["node", "dist/server.js"]

