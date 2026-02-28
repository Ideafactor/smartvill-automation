# Use the official Playwright image (includes Chromium and all system deps)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS base

# Install Node.js 20 and pnpm
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
COPY package.json pnpm-workspace.yaml ./
COPY packages/worker/package.json ./packages/worker/
RUN pnpm install --frozen-lockfile --filter worker

# Only install Chromium (reduce image size)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# ─── Build ────────────────────────────────────────────────────────────────────
COPY packages/worker/tsconfig.json ./packages/worker/
COPY packages/worker/src ./packages/worker/src

WORKDIR /app/packages/worker
RUN pnpm build

# ─── Runtime ──────────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["node", "dist/main.js"]
