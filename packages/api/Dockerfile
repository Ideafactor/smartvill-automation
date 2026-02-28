FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile --filter api

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY packages/api/tsconfig.json ./packages/api/
COPY packages/api/src ./packages/api/src
WORKDIR /app/packages/api
RUN pnpm build

# ─── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile --filter api --prod

COPY --from=builder /app/packages/api/dist ./packages/api/dist

WORKDIR /app/packages/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
