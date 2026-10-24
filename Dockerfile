# AegisMirage Least-Privilege Multi-Service Container
FROM python:3.11-slim

# Prevent python from buffering stdout/stderr and writing pyc
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install security updates and build requirements, then clean up
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root system user and group (UID 10001)
RUN groupadd -g 10001 aegis && \
    useradd -u 10001 -g aegis -d /app -s /usr/sbin/nologin aegis

# Install dependencies first for build layer caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir asyncssh paho-mqtt cryptography

# Copy application source code with restricted permissions
COPY --chown=aegis:aegis . /app

# Ensure non-root ownership of working directory
RUN chown -R aegis:aegis /app

# Drop to non-root unprivileged user
USER 10001:10001

# Default ports (8000 for FastAPI operator, 2222 for SSH decoy, 1883 for MQTT decoy)
EXPOSE 8000 2222 1883

# Default entrypoint runs single-process backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
