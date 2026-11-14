{{/* Fully-qualified image reference: [registry/]name:tag */}}
{{- define "sd.image" -}}
{{- $reg := .root.Values.image.registry -}}
{{- if $reg }}{{ $reg }}/{{ end }}{{ .image }}:{{ .root.Values.image.tag }}
{{- end -}}

{{/* Name of the Secret holding infrastructure credentials. */}}
{{- define "sd.credentials" -}}{{ .Values.credentials.existingSecret }}{{- end -}}

{{/* Credential env vars. Declared first so later entries can reference them with $(VAR). */}}
{{- define "sd.credEnv" -}}
- name: POSTGRES_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ include "sd.credentials" . }}, key: postgres-password } }
- name: RABBITMQ_USER
  valueFrom: { secretKeyRef: { name: {{ include "sd.credentials" . }}, key: rabbitmq-user } }
- name: RABBITMQ_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ include "sd.credentials" . }}, key: rabbitmq-password } }
- name: MINIO_ACCESS_KEY
  valueFrom: { secretKeyRef: { name: {{ include "sd.credentials" . }}, key: minio-access-key } }
- name: MINIO_SECRET_KEY
  valueFrom: { secretKeyRef: { name: {{ include "sd.credentials" . }}, key: minio-secret-key } }
- name: DATABASE_URL
  value: postgresql://{{ .Values.postgres.user }}:$(POSTGRES_PASSWORD)@postgres:5432/{{ .Values.postgres.database }}
- name: RABBITMQ_URL
  value: amqp://$(RABBITMQ_USER):$(RABBITMQ_PASSWORD)@rabbitmq:5672
{{- end -}}

{{/* core-api wiring that is not a plain setting. Settings come from the swiftdrop-config ConfigMap. */}}
{{- define "sd.coreEnv" -}}
- name: HOST
  value: "0.0.0.0"
- name: INTERNAL_HOST
  value: "0.0.0.0"
- name: PORT
  value: {{ .Values.coreApi.port | quote }}
- name: INTERNAL_PORT
  value: {{ .Values.coreApi.internalPort | quote }}
- name: REDIS_URL
  value: redis://redis:6379
- name: MINIO_ENDPOINT
  value: http://minio:9000
- name: AUTH_PRIVATE_KEY_FILE
  value: /run/swiftdrop/auth/private.pem
- name: AUTH_PUBLIC_KEYS_FILE
  value: /run/swiftdrop/auth/public-keys.json
- name: AUTH_KEY_ID
  value: {{ .Values.auth.keyId | quote }}
- name: CSRF_SECRET_FILE
  value: /run/swiftdrop/auth/csrf.key
- name: RATE_LIMIT_SECRET_FILE
  value: /run/swiftdrop/auth/rate-limit.key
- name: OAUTH_TRANSACTION_SECRET_FILE
  value: /run/swiftdrop/auth/oauth.key
- name: OUTBOX_RELAY_URL
  value: http://outbox-relay:{{ .Values.outboxRelay.port }}
{{- end -}}
