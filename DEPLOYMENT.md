# Развёртывание на VPS

Целевой адрес приложения: `https://app.date-not-hate.ru`.

## Перед началом

- В DNS уже должна быть A-запись `app.date-not-hate.ru` на IP VPS.
- В сетевом firewall провайдера должны быть открыты TCP-порты `22`, `80` и `443`.
- Репозиторий должен быть опубликован в GitHub. В `.env`, API-ключи и фотографии секреты не коммитятся.

На Mac проверьте DNS:

```bash
dig +short app.date-not-hate.ru
```

Команда должна вернуть `212.118.41.67`.

## Публикация проекта в GitHub

В каталоге проекта на Mac выполните один раз:

```bash
git add .
git commit -m "Prepare production deployment"
git push -u origin main
```

## Первый доступ

На Mac проверьте доступ по SSH:

```bash
ssh -i ~/.ssh/vds-server root@212.118.41.67
```

Если команда не подключается, используйте веб-консоль VPS и выполните:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Установка Docker

В веб-консоли или SSH-сессии выполните команды из [официальной инструкции Docker Engine для Ubuntu](https://docs.docker.com/engine/install/ubuntu/). После установки проверьте:

```bash
docker --version
docker compose version
```

## Получение проекта

Для публичного GitHub-репозитория:

```bash
apt-get update
apt-get install -y git
git clone https://github.com/FoOkySNick/date-not-hate.git /opt/date-not-hate
cd /opt/date-not-hate
```

Если репозиторий приватный, добавьте на сервере SSH deploy key с правом Read-only, затем используйте SSH URL репозитория вместо HTTPS.

## Production-конфигурация

Создайте защищённый файл с секретами:

```bash
cd /opt/date-not-hate
cp .env.production.example .env
chmod 600 .env
nano .env
```

В `.env` замените заполнители. Для `POSTGRES_PASSWORD` и `JWT_SECRET` используйте разные значения из команд:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

На своём Mac сгенерируйте VAPID-ключи и скопируйте три строки в `.env` сервера:

```bash
npm run push:keys -w backend
```

В Resend подтвердите поддомен `mail.date-not-hate.ru` и добавьте в `.env` `RESEND_API_KEY`. Адрес `MAIL_FROM` должен быть на этом подтверждённом поддомене, например `hello@mail.date-not-hate.ru`.

## Запуск и проверка

```bash
cd /opt/date-not-hate
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy
```

После получения сертификата откройте `https://app.date-not-hate.ru`. Для просмотра ошибок приложения используйте:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

## Обновление

```bash
cd /opt/date-not-hate
git pull --ff-only
docker compose -f docker-compose.prod.yml up --build -d
```
