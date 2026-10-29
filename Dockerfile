# syntax=docker/dockerfile:1

# ---- stage 1: frontend ----------------------------------------------------
# Kept separate so the Node toolchain never reaches the shipped image.
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run typecheck && npm run build

# ---- stage 2: backend -----------------------------------------------------
FROM golang:1.25-alpine AS build
WORKDIR /src
# Dependencies first: this layer is cached until go.mod changes.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Use the bundle produced by the web stage rather than rebuilding it.
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/server ./cmd/server

# ---- stage 3: runtime -----------------------------------------------------
FROM alpine:3.20
# ca-certificates and tzdata are deliberately unpinned: they must track the base
# image's Alpine release, and pinning them here would break the build on the next
# security rebuild of the base layer.
# hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app
# tzdata matters: the dashboard buckets months in Asia/Shanghai, and without it
# the aggregation would silently fall back to UTC.
ENV TZ=Asia/Shanghai
COPY --from=build /out/server /usr/local/bin/server
# Numeric user: an orchestrator's runAsNonRoot check can verify a number, not a
# name in /etc/passwd.
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/server"]
