FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# 模板环境变量，可在构建或运行时覆盖
ENV NODE_ENV=production
ENV TELEGRAM_TOKEN=YOUR_TELEGRAM_TOKEN_HERE
ENV API_BASE_URL=https://your-api-url-here

CMD ["node", "index.js"]
