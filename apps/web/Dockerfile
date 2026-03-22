FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN pnpm --filter @agent-madness/shared build && pnpm --filter @agent-madness/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@agent-madness/web", "start"]
