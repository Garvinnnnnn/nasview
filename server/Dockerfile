FROM node:22-alpine

# coreutils 提供 GNU df(-B1)，util-linux 提供 lsblk，
# smartmontools 读取 SMART，docker-cli 通过挂载的 socket 读容器列表。
RUN apk add --no-cache coreutils util-linux smartmontools docker-cli

WORKDIR /app
COPY index.js ./
RUN mkdir -p /app/data

ENV NP_HOST=0.0.0.0 \
    NP_PORT=8787 \
    NP_DATA_DIR=/app/data

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1

CMD ["node", "index.js"]
