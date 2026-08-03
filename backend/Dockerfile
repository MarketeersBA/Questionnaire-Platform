# --- Stage 1: Builder ---
FROM python:3.11-slim-bullseye AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --default-timeout=1000 --user --no-cache-dir -r requirements.txt

# --- Stage 2: Production ---
FROM python:3.11-slim-bullseye
RUN useradd -m -r appuser
WORKDIR /app
COPY --chown=appuser:appuser --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

RUN apt-get update -o Acquire::Retries=3 && apt-get install -y --no-install-recommends --fix-missing \
    tini ffmpeg libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=appuser:appuser backend/ ./backend/
RUN mkdir -p /tmp/reports && chown appuser:appuser /tmp/reports
USER appuser
RUN playwright install chromium
ENV PYTHONPATH=/app PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8080/health')"
ENTRYPOINT ["tini", "--"]
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", \
    "backend.main:app", "--bind", "0.0.0.0:8080", "--timeout", "120"]
