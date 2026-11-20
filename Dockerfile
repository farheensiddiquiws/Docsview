FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/data/ajaia-docs.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
