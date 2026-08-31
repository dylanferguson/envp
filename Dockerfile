# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
RUN pnpm build && pnpm prune --prod

FROM gcr.io/distroless/nodejs24-debian12

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/shares.db

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8080
VOLUME ["/data"]

CMD ["dist/server/main.js"]
