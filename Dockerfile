# Stage 1: Build Next.js app
FROM node:18-alpine AS next-builder
WORKDIR /app
COPY qr-campaign-next/package*.json ./
RUN npm ci
COPY qr-campaign-next/ .
RUN npm run build

# Stage 2: Build Python environment
FROM python:3.8-slim AS python-builder
WORKDIR /app
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Production environment
FROM python:3.8-slim
WORKDIR /app

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python environment
COPY --from=python-builder /usr/local/lib/python3.8/site-packages/ /usr/local/lib/python3.8/site-packages/
COPY python/ ./python/

# Copy Next.js app
COPY --from=next-builder /app/.next ./.next
COPY --from=next-builder /app/public ./public
COPY --from=next-builder /app/package*.json ./
COPY --from=next-builder /app/next.config.js ./
RUN npm install --production

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000 8000
CMD ["./start.sh"] 