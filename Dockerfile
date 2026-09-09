# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
# 服务器运行时复用前端引擎（server/*.ts 引用了 ../src/core/*），必须带上 src
COPY --from=build /app/src ./src
EXPOSE 3001
CMD ["npm", "run", "server"]
