# syntax=docker/dockerfile:1.7

FROM python:3.11-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    CHROME_PATH=/usr/bin/chromium

ARG TORCH_CPU_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    set -eux; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get update -o Acquire::Retries=8; \
    apt-get install -y --no-install-recommends \
      gcc \
      nodejs \
      npm \
      pandoc \
      chromium \
      libreoffice-core \
      libreoffice-impress \
      fonts-noto-cjk \
      fonts-wqy-zenhei; \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g @marp-team/marp-cli

COPY requirements*.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --index-url ${TORCH_CPU_INDEX_URL} "torch>=2.1,<3"
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .
RUN prisma generate

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["sh", "-c", "prisma migrate deploy && uvicorn main:app --host 0.0.0.0 --port 8000"]
