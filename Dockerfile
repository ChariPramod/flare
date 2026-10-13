FROM node:22.23.3-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
ARG SERVICE=api
ENV SERVICE=$SERVICE
CMD ["sh", "-c", "if [ \"$SERVICE\" = web ]; then exec node apps/web/node_modules/next/dist/bin/next start apps/web -H 0.0.0.0; else exec node \"apps/$SERVICE/dist/main.js\"; fi"]
