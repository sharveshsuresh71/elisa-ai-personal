FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
RUN npx livekit-agents download-files
COPY . .
RUN npm run build && npm prune --omit=dev
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/* && adduser --disabled-password --gecos "" --home /app --shell /usr/sbin/nologin --uid 10001 appuser
COPY --from=build --chown=appuser:appuser /app /app
USER appuser
CMD ["node", "dist/agent.js", "start"]
