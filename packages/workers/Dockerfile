# Stage 1: Dependency resolution
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy lockfile and package.json files
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/workers/package.json ./packages/workers/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/api/package.json ./packages/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/workers/node_modules ./packages/workers/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules

# Copy source code
COPY package.json tsconfig.base.json ./
COPY packages/workers ./packages/workers
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database

# Build shared and database client
RUN npm run build --workspace=packages/shared
RUN npm run db:generate

# Build Workers
RUN npm run build --workspace=packages/workers

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workers

# Copy built code and dependencies
COPY --from=builder /app/packages/workers/dist ./packages/workers/dist
COPY --from=builder /app/packages/workers/package.json ./packages/workers/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/workers/node_modules ./packages/workers/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/database/node_modules /app/packages/database/node_modules

# Create model cache folder and set owner
RUN mkdir -p /app/.transformers-cache && chown -R workers:nodejs /app/.transformers-cache

USER workers

CMD ["npm", "start", "--workspace=packages/workers"]
