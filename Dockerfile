FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/app/data
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:full
EXPOSE 8787
CMD ["npm", "run", "start"]
