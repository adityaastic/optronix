FROM node:22-alpine AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY . /ctx
RUN if [ -f /ctx/backend/package.json ]; then cp -a /ctx/backend/. /app/; else cp -a /ctx/. /app/; fi && rm -rf /ctx

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && mkdir -p /app/uploads

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]
