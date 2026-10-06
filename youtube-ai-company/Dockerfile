# AI YouTube Company — runs the full autopilot 24/7.
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

# ffmpeg (with libass for captions) + Japanese fonts for video rendering
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3100
VOLUME ["/app/data", "/app/logs", "/app/secrets", "/app/deliveries"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/cli/index.js", "autopilot"]
