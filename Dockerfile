ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app


FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev


FROM base AS builder
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build


FROM base AS dev
ENV NODE_ENV=development

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY test ./test
RUN chown node:node /app

USER node

CMD ["npm", "run", "dev"]


FROM base AS runner
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node

CMD ["node", "dist/main.js"]
