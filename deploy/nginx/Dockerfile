# Gateway nginx for Docker Compose (:80, and :443 when SD_ENABLE_TLS=true).
# On Kubernetes the Ingress replaces this image (see deploy/helm).
# Build context is the repository root:  docker build -f deploy/nginx/Dockerfile .
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/routes.inc /etc/nginx/swiftdrop/routes.inc
COPY deploy/nginx/proxy.inc /etc/nginx/swiftdrop/proxy.inc
COPY deploy/nginx/tls.conf /etc/nginx/swiftdrop/tls.conf
COPY deploy/nginx/40-tls.sh /docker-entrypoint.d/40-tls.sh
RUN chmod +x /docker-entrypoint.d/40-tls.sh && mkdir -p /etc/nginx/conf.d /etc/nginx/certs
EXPOSE 80 443
