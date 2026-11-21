#!/bin/sh
# Enables :443 only when SD_ENABLE_TLS=true. Mount real certificates at /etc/nginx/certs
# (tls.crt, tls.key); otherwise a self-signed development certificate is generated.
# Remember to set APP_ORIGIN to the https origin you browse (and COOKIE_SECURE=true) for core-api.
set -eu
if [ "${ENABLE_TLS:-false}" != "true" ]; then
  echo "40-tls: ENABLE_TLS is not true; serving plain HTTP on :80 only."
  exit 0
fi
if [ ! -f /etc/nginx/certs/tls.crt ] || [ ! -f /etc/nginx/certs/tls.key ]; then
  echo "40-tls: generating a self-signed development certificate."
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout /etc/nginx/certs/tls.key -out /etc/nginx/certs/tls.crt \
    -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
fi
cp /etc/nginx/swiftdrop/tls.conf /etc/nginx/conf.d/tls.conf
