FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
EXPOSE 3001
CMD ["pnpm", "--filter", "@agent-madness/api", "start"]
