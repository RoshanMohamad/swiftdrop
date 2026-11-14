# web: builds the React SPA and serves the static files only. API routing is done by the
# gateway nginx (compose) or the Ingress (Kubernetes), never by this image.
# Build context is the repository root:  docker build -f apps/web/Dockerfile .
ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

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
    pnpm install --frozen-lockfile --filter web...
RUN pnpm --filter web build

FROM ${NGINX_IMAGE} AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
