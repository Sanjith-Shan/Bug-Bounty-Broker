FROM --platform=linux/amd64 python:3.11-slim AS base

USER root
WORKDIR /app

# System deps for Foundry, Caddy, Node (inference sidecar), sqlite, and build toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        ca-certificates \
        build-essential \
        sqlite3 \
        debian-keyring \
        debian-archive-keyring \
        apt-transport-https \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy \
    && rm -rf /var/lib/apt/lists/*

# Install Foundry
RUN curl -L https://foundry.paradigm.xyz | bash \
    && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY app/ ./app/
COPY inference/ ./inference/
COPY contracts/ ./contracts/
COPY exploits/ ./exploits/
COPY foundry.toml ./
COPY Caddyfile /etc/caddy/Caddyfile
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Pre-create state dirs
RUN mkdir -p /app/data /app/work

EXPOSE 80 443 3000
ENV APP_PORT=3000

CMD ["./entrypoint.sh"]
