#!/bin/sh
set -eu

previous_revision=${1:?Previous revision is required.}

health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$1"
}

wait_for_healthy_stack() {
  attempt=0
  while [ "$attempt" -lt 12 ]; do
    if [ "$(health_status date-not-hate-postgres-1)" = healthy ] && \
      [ "$(health_status date-not-hate-app-1)" = healthy ] && \
      [ "$(health_status date-not-hate-caddy-1)" = healthy ] && \
      curl --fail --silent --show-error https://app.date-not-hate.ru/health; then
      printf '\nProduction health checks passed.\n'
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
  return 1
}

deploy_current_revision() {
  docker compose -f docker-compose.prod.yml up -d --build --force-recreate app caddy || return 1
  wait_for_healthy_stack
}

if deploy_current_revision; then
  exit 0
fi

echo "Deployment failed; rolling back to ${previous_revision}." >&2
git reset --hard "$previous_revision"
deploy_current_revision
printf 'Rollback completed.\n'
