# Imagem base no Docker Hub — evita pull de ghcr.io/railwayapp/nixpacks quando o host
# não resolve ghcr.io (erro: lookup ghcr.io on 127.0.0.11:53: no such host).
# No EasyPanel: use build por Dockerfile (ou desative Nixpacks) se o deploy ainda gerar Dockerfile a partir do Nixpacks.
FROM docker.io/library/node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start"]
