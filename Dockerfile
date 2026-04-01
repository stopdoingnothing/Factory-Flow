# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native module compilation (bcrypt, pg)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Vite client + esbuild server bundle → dist/
RUN NODE_ENV=production npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# python3/make/g++ for native modules; postgresql-client for pg_isready in entrypoint
RUN apk add --no-cache python3 make g++ postgresql-client

WORKDIR /app

COPY package*.json ./

# Carry node_modules from builder so native modules (bcrypt) and devDeps
# (drizzle-kit, needed for db:push on first start) are all present.
COPY --from=builder /app/node_modules ./node_modules

# Copy built artefacts
COPY --from=builder /app/dist ./dist

# Drizzle config + schema (drizzle-kit reads these at runtime)
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared

# Entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["./docker-entrypoint.sh"]
