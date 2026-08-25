# Stage 1: dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

# Install system deps needed by some native packages
RUN apk add --no-cache libc6-compat python3 make g++

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY server ./server
COPY lib ./lib
COPY scripts ./scripts

RUN npm run server:build

# Stage 2: production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/server/index.js"]
