# =============================================================================
# AegisMirage — Multi-Stage Production Container for Cloud & Render Deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Vite React Dashboard Bundle
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY dashboard/package*.json ./
RUN npm ci

COPY dashboard/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Unified FastAPI Backend + Integrated Static Host
# -----------------------------------------------------------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Install security updates, CA certificates, and OpenCV/vision system libraries
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user
RUN groupadd -g 10001 aegis && \
    useradd -u 10001 -g aegis -d /app -s /usr/sbin/nologin aegis

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir asyncssh paho-mqtt cryptography

# Copy backend application source code
COPY --chown=aegis:aegis . /app

# Copy built production dashboard from Stage 1 into dashboard/dist
COPY --from=frontend-builder --chown=aegis:aegis /build/dist /app/dashboard/dist

# Pre-create runtime storage directories with non-root ownership
RUN mkdir -p /app/edge_storage /app/quarantine && \
    chown -R aegis:aegis /app

# Drop to non-root unprivileged user
USER 10001:10001

# Expose default port
EXPOSE 8000

# Start unified Uvicorn server bound to 0.0.0.0 and Render's $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
