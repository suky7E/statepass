FROM node:20-alpine

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy pre-installed node_modules (no network access in build)
# COPY node_modules ./node_modules

# Normal build network
COPY package*.json ./
RUN npm ci
COPY . .

COPY package.json package-lock.json ./

# Copy source
COPY . .

# Remove example env so it can't be read inside container
RUN rm -f .env.example

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
