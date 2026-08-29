# Date Not Hate VPS Deployment Design

## Goal

Deploy Date Not Hate on the existing VPS at `212.118.41.67` with the public application address `https://app.date-not-hate.ru`.

## DNS and mail boundaries

- `app.date-not-hate.ru` is the application hostname. Its A record must resolve to `212.118.41.67` before the first Caddy start.
- `do.date-not-hate.ru` remains delegated to Unisender for email link tracking and is not used by the web application.
- Unisender handles email delivery for the confirmed `date-not-hate.ru` sending domain. `MAIL_FROM` uses that confirmed domain.

## Server topology

Docker Compose runs three services on the VPS:

- `postgres`: PostgreSQL 16 with a named persistent volume.
- `app`: Node application and built React PWA, connected only to the Compose network.
- `caddy`: the only publicly exposed service. It listens on ports 80 and 443, obtains a Let's Encrypt certificate for `app.date-not-hate.ru`, and reverse-proxies to `app:3001`.

Named volumes persist PostgreSQL data, uploaded photos, and Caddy certificate state across container rebuilds.

## Provisioning flow

1. Verify DNS propagation and SSH access; allow firewall ports 22, 80, and 443.
2. Install Docker Engine, Docker Compose plugin, and Git on the VPS.
3. Clone the `main` branch into `/opt/date-not-hate`.
4. Create `/opt/date-not-hate/.env` with `APP_HOST=app.date-not-hate.ru`, `APP_URL=https://app.date-not-hate.ru`, generated database/JWT secrets, confirmed Unisender credentials, and generated VAPID keys. The file is mode `600` and is never committed.
5. Run `docker compose -f docker-compose.prod.yml up --build -d`.
6. Verify Compose health, HTTPS certificate issuance, `/health`, registration, and a real email delivery.

## Failure handling and updates

- If DNS is not visible publicly, do not start Caddy: certificate issuance would fail. Recheck the authoritative and public resolvers.
- If a container fails, inspect `docker compose -f docker-compose.prod.yml logs app` or `logs caddy`; do not delete named volumes during diagnosis.
- Updates use `git pull --ff-only` followed by `docker compose -f docker-compose.prod.yml up --build -d`.
