# SwiftDrop on Kubernetes (Helm)

Chart: [swiftdrop/](swiftdrop/). Everything deploys to the `swiftdrop` namespace.

| Resource | Kind |
|---|---|
| core-api, web, outbox-relay, webhook-svc, notification-svc, ai-assistant, redis | Deployments, with `/healthz` liveness and readiness probes |
| postgres, rabbitmq, minio | StatefulSets with PVCs (`volumeClaimTemplates`) |
| Settings / credentials | ConfigMap `swiftdrop-config` / Secrets |
| Edge | Ingress (replaces the compose nginx) |
| core-api autoscaling | HPA on CPU |
| Schema | Job `swiftdrop-migrate-<revision>` runs `prisma migrate deploy` |

The Ingress routes `/api`, `/oauth`, `/socket.io` to core-api, `/mcp` to ai-assistant and `/` to web.
core-api's internal port (3001, used by notification-svc) is a ClusterIP port only and is never routed.

## Images

Each service has its own multi-stage Dockerfile (compiled JS and production dependencies only):

```bash
docker build -f apps/core-api/Dockerfile        -t swiftdrop/core-api:dev .
docker build -f apps/outbox-relay/Dockerfile    -t swiftdrop/outbox-relay:dev .
docker build -f apps/webhook-svc/Dockerfile     -t swiftdrop/webhook-svc:dev .
docker build -f apps/notification-svc/Dockerfile -t swiftdrop/notification-svc:dev .
docker build -f apps/ai-assistant/Dockerfile    -t swiftdrop/ai-assistant:dev .
docker build -f apps/web/Dockerfile             -t swiftdrop/web:dev .
docker build -f packages/db/Dockerfile          -t swiftdrop/db:dev .
```

## Local cluster (kind or minikube)

```bash
kind create cluster --name swiftdrop      # needs an ingress-nginx controller for the Ingress
kind load docker-image --name swiftdrop swiftdrop/core-api:dev swiftdrop/outbox-relay:dev \
  swiftdrop/webhook-svc:dev swiftdrop/notification-svc:dev swiftdrop/ai-assistant:dev \
  swiftdrop/web:dev swiftdrop/db:dev

# Auth keys (development only) and the Secret the chart expects:
pnpm auth:keys:generate
kubectl create namespace swiftdrop
kubectl -n swiftdrop create secret generic swiftdrop-auth --from-file=.local/auth

helm upgrade --install swiftdrop deploy/helm/swiftdrop -n swiftdrop \
  -f deploy/helm/swiftdrop/values-local.yaml
```

`values-local.yaml` creates the development credentials Secret itself (`credentials.create: true`),
runs single replicas, disables the HPA and TLS, and enables Mailpit.

## notification-svc signing key

notification-svc signs short-lived service JWTs for core-api's internal lookup. Provision the key
once against the cluster database (with the same `SERVICE_ISSUER` as `config.serviceIssuer`), then
store the two files it writes as a Secret:

```bash
# with DATABASE_URL pointing at the cluster database (e.g. through kubectl port-forward)
SERVICE_ISSUER=https://core-api.swiftdrop.svc.cluster.local:3001 pnpm services:provision --service notification-svc
kubectl -n swiftdrop create secret generic swiftdrop-notification-signer \
  --from-file=.local/services/notification-svc
```

The Secret is mounted at `/app/.local/services/notification-svc`, which is the path recorded in
`signer.json`. Until it exists, notification-svc stays `ContainerCreating`.

## Hosted cluster

Create these Secrets out of band (sealed-secrets, external-secrets, `kubectl`) — never commit them:

| Secret | Keys |
|---|---|
| `swiftdrop-credentials` | `postgres-password`, `rabbitmq-user`, `rabbitmq-password`, `minio-access-key`, `minio-secret-key` |
| `swiftdrop-auth` | `private.pem`, `public-keys.json`, `csrf.key`, `rate-limit.key`, `oauth.key` |
| `swiftdrop-notification-signer` | `signer.json`, `<keyId>.pem` |
| `swiftdrop-tls` | the Ingress certificate |

Then edit [values-hosted.yaml](swiftdrop/values-hosted.yaml) (registry, tag, host, `appOrigin`,
SMTP relay, storage classes) and:

```bash
helm upgrade --install swiftdrop deploy/helm/swiftdrop -n swiftdrop --create-namespace \
  -f deploy/helm/swiftdrop/values-hosted.yaml
```

`NODE_ENV=production` makes core-api refuse insecure settings (non-HTTPS origins, `.local` key
paths, default RabbitMQ or MinIO credentials), so a misconfigured release fails fast.

## Notes

- Versions: `values.yaml` uses PostgreSQL 16 and RabbitMQ 3.13 as in the design report; the
  Compose file and the recorded test runs use PostgreSQL 17 and RabbitMQ 4. Align them before
  production.
- `helm lint` and `helm template` pass for both values files. The chart has **not** been installed
  on a real cluster yet.
