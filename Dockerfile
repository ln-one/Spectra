FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG http_proxy
ARG https_proxy

COPY scripts/install-pandoc.sh /tmp/install-pandoc.sh
RUN http_proxy="$http_proxy" https_proxy="$https_proxy" \
    bash -c 'apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install --yes --no-install-recommends ca-certificates curl \
    && bash /tmp/install-pandoc.sh /usr/local \
    && rm /tmp/install-pandoc.sh \
    && rm -rf /var/lib/apt/lists/*'

COPY package.json package-lock.json ./
RUN http_proxy="$http_proxy" https_proxy="$https_proxy" \
    npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN --mount=type=secret,id=production_env,target=/app/.env.production \
    NODE_OPTIONS=--max-old-space-size=8192 npm run build

ENV NODE_ENV=production
EXPOSE 3000

USER node
CMD ["npm", "run", "start"]
