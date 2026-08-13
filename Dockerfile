FROM docker.io/oven/bun:canary-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build:binary \
	&& mkdir -p /runtime/data /runtime/uploads/benchmarks \
	&& chown -R 65532:65532 /runtime

FROM docker.io/library/alpine:latest AS runtime

RUN apk add --no-cache ca-certificates libgcc libstdc++ tzdata

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000

WORKDIR /app

COPY --from=build --chown=65532:65532 /app/flightlesskiwi /app/flightlesskiwi
COPY --from=build --chown=65532:65532 /runtime/data /data
COPY --from=build --chown=65532:65532 /runtime/uploads /uploads

USER 65532:65532

VOLUME ["/data", "/uploads"]
EXPOSE 3000

ENTRYPOINT ["/app/flightlesskiwi"]
