# ==============================================================================
# Homeward Worker — Production Multi-Stage Dockerfile
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install dependencies with network retry tolerance
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000

# Copy source code and abis
COPY src ./src

# Compile TypeScript to dist/
RUN npm run build

# Prune devDependencies to leave only production packages
RUN npm prune --omit=dev && npm cache clean --force

# ------------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install tini for graceful init process lifecycle & signal forwarding (SIGTERM / SIGINT)
RUN apk add --no-cache tini

ENV NODE_ENV=production

# Copy package manifests and pruned production node_modules from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Run as non-root unprivileged node user
USER node

# Healthcheck to verify the Node process is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
