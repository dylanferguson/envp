# syntax=docker/dockerfile:1

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS web
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./web
COPY vite.config.ts tsconfig.json ./
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
RUN pnpm exec vp build

FROM golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
ARG GIT_COMMIT=unknown
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.commit=${GIT_COMMIT}" -o /envp ./cmd/envp
RUN mkdir /data && chown 65532:65532 /data

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 AS nginx
COPY deploy/nginx/security_headers.conf /etc/nginx/security_headers.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web /app/dist/client /usr/share/nginx/html
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=10 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

FROM scratch AS envp
COPY --from=build /envp /envp
COPY --from=build --chown=65532:65532 /data /data
USER 65532:65532
# Leave PORT unset so compose/Fly can put the API on 8081 behind nginx.
ENV INTERNAL_PORT=9090 DB_PATH=/data/shares.db
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/envp", "healthcheck"]
EXPOSE 8080 9090
VOLUME ["/data"]
ENTRYPOINT ["/envp"]
