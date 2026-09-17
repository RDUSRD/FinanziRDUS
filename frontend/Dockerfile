# ---- build ----
FROM node:22-alpine AS build

WORKDIR /app

# Versión de pnpm fijada a juego con el lockfile del repo (evita sorpresas de corepack).
RUN npm install -g pnpm@11.10.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ---- runtime ----
# Imagen "unprivileged": el proceso maestro de nginx corre sin privilegios (uid 101)
# y escucha en 8080 en lugar de 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
