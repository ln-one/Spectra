# syntax=docker/dockerfile:1.7
FROM python:3.11-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DISPLAY=:99

# 换成阿里云 Debian 镜像，国内网络大幅提速
RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' \
        /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://deb.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' \
        /etc/apt/sources.list.d/debian.sources

# 系统依赖：manim 渲染需要 cairo、pango、ffmpeg
# LaTeX 包体积很大（~500MB），只在需要数学公式渲染时保留
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    set -eux; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get update -o Acquire::Retries=5; \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      libcairo2-dev \
      libpango1.0-dev \
      pkg-config \
      python3-dev \
      gcc \
      fonts-noto-cjk \
      fonts-wqy-zenhei \
      texlive-latex-base \
      texlive-fonts-recommended \
      cm-super \
      dvipng; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# 第一步：先装轻量依赖（fastapi/uvicorn 等），国内镜像快
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install fastapi==0.115.0 "uvicorn[standard]==0.30.6" \
        python-multipart==0.0.9 Pillow==10.4.0 \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --timeout 60

# 第二步：单独装 manim，体积大，给足超时和重试
# manim 依赖 scipy/numpy/manimpango 等，先用国内镜像装依赖
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install numpy scipy \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --timeout 120

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install manim==0.18.1 \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --timeout 300 \
    --retries 5

COPY . .

EXPOSE 8120

HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8120/health/ready', timeout=3)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8120"]
