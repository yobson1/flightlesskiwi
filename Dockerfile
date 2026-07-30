FROM docker.io/oven/bun:canary-slim AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build

FROM docker.io/oven/bun:canary-slim AS production-dependencies

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM docker.io/oven/bun:canary-slim AS runtime

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000

WORKDIR /app

COPY package.json bun.lock ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/build ./build
COPY --chown=bun:bun drizzle ./drizzle
COPY --chown=bun:bun scripts/migrate.ts ./scripts/migrate.ts

RUN mkdir -p /data /uploads/benchmarks \
	&& chown -R bun:bun /app /data /uploads

USER bun

VOLUME ["/data", "/uploads"]
EXPOSE 3000

CMD ["bun", "run", "build/index.js"]
