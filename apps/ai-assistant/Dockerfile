# ai-assistant (MCP server): multi-stage build. The runtime image holds compiled JS and
# production dependencies only. It has no database access: its tools call the core-api REST API.
# Build context is the repository root:  docker build -f apps/ai-assistant/Dockerfile .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Optional npm mirror: docker compose build --build-arg NPM_REGISTRY=https://registry.yarnpkg.com
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
RUN echo "registry=${NPM_REGISTRY}" > /root/.npmrc
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ai-assistant...
RUN pnpm --filter ai-assistant build \
 && pnpm --filter ai-assistant deploy --legacy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app/apps/ai-assistant
COPY --from=build /out ./
USER node
EXPOSE 5000
CMD ["node", "dist/server.js"]
