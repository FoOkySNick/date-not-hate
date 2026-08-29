# Date Not Hate VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Date Not Hate at `https://app.date-not-hate.ru` on VPS `212.118.41.67` while preserving its existing VPN.

**Architecture:** Docker Compose runs PostgreSQL, the Node/React application, and Caddy. Caddy alone exposes HTTP/HTTPS and obtains the certificate for `app.date-not-hate.ru`; `do.date-not-hate.ru` remains delegated to Unisender for email tracking.

**Tech Stack:** Ubuntu VPS, Docker Engine, Docker Compose plugin, PostgreSQL 16, Caddy 2, Node 22 image, Unisender Go, VAPID Web Push.

**Spec:** `docs/superpowers/specs/2026-08-29-vps-deployment-design.md`

## Global Constraints

- Deploy only `main` from `https://github.com/FoOkySNick/date-not-hate.git`.
- Application hostname is exactly `app.date-not-hate.ru`; it must publicly resolve to `212.118.41.67` before Caddy starts.
- Leave `do.date-not-hate.ru` delegated to Unisender; do not use it for the web application.
- Preserve the existing VPN service, its ports, routing, NAT rules, interfaces, and configuration.
- Do not delete Docker volumes, PostgreSQL data, VPN files, or firewall rules while provisioning.
- Keep all runtime secrets in `/opt/date-not-hate/.env` with mode `600`; never commit or print them.

---

### Task 1: Publish and validate the release source

**Files:**
- Modify: GitHub branch `main` only through a fast-forward push.
- Verify: local repository and public DNS.

**Interfaces:**
- Consumes: local `main`, origin remote, `app.date-not-hate.ru` DNS.
- Produces: a GitHub `main` branch that contains `a9ece6c` and a public A record for the VPS.

- [ ] **Step 1: Confirm local source is deployable**

Run:

```bash
git status -sb
git log --oneline origin/main..main
npm test
npm run build
```

Expected: no uncommitted application files; tests and build pass.

- [ ] **Step 2: Push local `main` without rewriting remote history**

Run:

```bash
git push origin main
git status -sb
```

Expected: `main` and `origin/main` point to the same commit.

- [ ] **Step 3: Verify authoritative and public DNS**

Run:

```bash
dig @ns1.reg.ru app.date-not-hate.ru A +short
dig @1.1.1.1 app.date-not-hate.ru A +short
```

Expected: both commands return `212.118.41.67`. If either does not, stop and wait for DNS propagation; do not start Caddy.

### Task 2: Establish access and audit the VPN before change

**Files:**
- Create: a temporary SSH key under the local system temporary directory.
- Verify: VPS service, network, route, port, and firewall state.

**Interfaces:**
- Consumes: root SSH access to `212.118.41.67`.
- Produces: a recorded baseline showing the VPN service and any port conflicts before Docker installation.

- [ ] **Step 1: Use a dedicated, temporary SSH key for deployment**

Generate an `ed25519` keypair in a temporary directory, add its public key to `/root/.ssh/authorized_keys` through the provider console or an already-authorized root session, and confirm key-based access:

```bash
ssh -i /private/tmp/date-not-hate-deploy/id_ed25519 root@212.118.41.67 'id && hostname'
```

Expected: output identifies `root` and the VPS hostname without asking for a password.

- [ ] **Step 2: Capture the VPN and network baseline without changing it**

Run on the VPS:

```bash
systemctl --type=service --state=running --no-pager
ip -brief address
ip route
ss -lntup
ufw status verbose || true
iptables -S
```

Expected: identify the VPN process, its listening ports, interface, and firewall/routing rules. Save the command output in the deployment session; do not edit any VPN or firewall configuration yet.

- [ ] **Step 3: Decide whether Caddy can use 80 and 443**

Inspect the `ss -lntup` output for listeners on TCP ports `80` and `443`.

Expected: no conflicting listener. If a service owns either port, stop and inspect that service before selecting a replacement proxy or port strategy.

### Task 3: Install container runtime and expose only web ports

**Files:**
- Modify: VPS package database and firewall only after Task 2 confirms no VPN conflict.
- Verify: Docker and firewall status.

**Interfaces:**
- Consumes: audited VPS with no 80/443 conflict.
- Produces: Docker Engine and Compose plugin available to root; TCP 80/443 accepted without changing VPN rules.

- [ ] **Step 1: Install Docker Engine and Git from their official repositories**

Run on the VPS and stop if `VERSION_ID` is not an Ubuntu release supported by Docker Engine:

```bash
. /etc/os-release
test "$ID" = ubuntu
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Then verify:

```bash
docker --version
docker compose version
git --version
```

Expected: each command exits successfully.

- [ ] **Step 2: Open application web ports conservatively**

Only if Task 2 showed UFW is active and ports are not already allowed, run:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw status numbered
```

Expected: only TCP 80 and 443 are added. Do not run `ufw reset`, do not alter OpenSSH or VPN rules, and do not change Docker daemon network settings.

### Task 4: Configure secrets and start the stack

**Files:**
- Create: `/opt/date-not-hate/.env`.
- Create: Docker named volumes `postgres_data`, `photos_data`, `caddy_data`, `caddy_config` through Compose.
- Verify: `/opt/date-not-hate/docker-compose.prod.yml` services.

**Interfaces:**
- Consumes: GitHub `main`, Docker runtime, Unisender API key supplied through a temporary protected file, and the application hostname.
- Produces: running `postgres`, `app`, and `caddy` containers.

- [ ] **Step 1: Clone the release into the production directory**

Run on the VPS:

```bash
git clone --branch main --single-branch https://github.com/FoOkySNick/date-not-hate.git /opt/date-not-hate
cd /opt/date-not-hate
git rev-parse --short HEAD
```

Expected: the checkout is on `main` and includes the deploy hardening commit `a9ece6c`.

- [ ] **Step 2: Generate VAPID keys locally without printing them**

Run in the local repository:

```bash
umask 077
npm run push:keys -w backend > /private/tmp/date-not-hate-vapid.env
scp -i /private/tmp/date-not-hate-deploy/id_ed25519 /private/tmp/date-not-hate-vapid.env root@212.118.41.67:/root/date-not-hate-vapid.env
```

Expected: the VPS file contains `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`; do not display either file in the terminal transcript.

- [ ] **Step 3: Assemble the protected production environment file**

Run on the VPS to create `/opt/date-not-hate/.env` with mode `600`:

```bash
cd /opt/date-not-hate
umask 077
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
{
  printf '%s\n' 'APP_HOST=app.date-not-hate.ru'
  printf '%s\n' 'APP_URL=https://app.date-not-hate.ru'
  printf '%s\n' 'POSTGRES_DB=date_not_hate'
  printf '%s\n' 'POSTGRES_USER=date_not_hate'
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
  printf '%s\n' 'MAIL_FROM=Date, not Hate <hello@date-not-hate.ru>'
  cat /root/date-not-hate-vapid.env
  cat /root/date-not-hate-secrets.env
} > .env
chmod 600 .env
```

Confirm only the file mode and variable names:

```bash
chmod 600 /opt/date-not-hate/.env
stat -c '%a %n' /opt/date-not-hate/.env
cut -d= -f1 /opt/date-not-hate/.env
```

Expected: mode `600`; no secret values printed.

- [ ] **Step 4: Start the production stack**

Run on the VPS:

```bash
cd /opt/date-not-hate
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
```

Expected: PostgreSQL becomes healthy; `app` and `caddy` are running.

### Task 5: Verify the live service and clean secret handoff artifacts

**Files:**
- Delete: temporary VPS secret handoff file only after `.env` is confirmed complete.
- Verify: HTTPS endpoint, application health, Caddy certificate logs, and Unisender mail delivery.

**Interfaces:**
- Consumes: running Compose stack and public DNS.
- Produces: verified HTTPS application with the VPN still running.

- [ ] **Step 1: Verify Caddy certificate issuance and application health**

Run on the VPS:

```bash
cd /opt/date-not-hate
docker compose -f docker-compose.prod.yml logs --tail=100 caddy
curl --fail --silent --show-error https://app.date-not-hate.ru/health
```

Expected: Caddy has no certificate error and `/health` returns JSON containing `"ok":true`.

- [ ] **Step 2: Confirm the VPN remained healthy**

Run the Task 2 audit commands again and compare the VPN service, its listeners, interface, routes, and firewall rules with the recorded baseline.

Expected: the VPN process remains running and its original networking behavior is unchanged.

- [ ] **Step 3: Verify application behavior and email delivery**

Open `https://app.date-not-hate.ru`, register a disposable test account, and confirm the Unisender verification email arrives. Then use the confirmation link and check that login succeeds.

Expected: HTTPS is valid, the application loads, and the email link points to `https://app.date-not-hate.ru`.

- [ ] **Step 4: Remove temporary secret artifacts**

After successful verification, remove only the temporary VAPID and Unisender handoff files, retaining `/opt/date-not-hate/.env`:

```bash
rm -f /root/date-not-hate-vapid.env /root/date-not-hate-secrets.env
```

Expected: `/opt/date-not-hate/.env` remains mode `600`; no secret is tracked by Git.
