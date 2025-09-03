# 使用官方 Node.js LTS 镜像
FROM node:20-alpine

# 设置环境变量（可在 docker run 或 CI/CD 时覆盖）
ENV TG_BOT_TOKEN=123456789:xxxxxxxxxxxxxxxxxxxxxx
ENV API_BASE_URL=https://xyz.xyz.xyz/api
ENV PORT=3033
ENV TG_ID=xxxxx

# 创建工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制项目文件
COPY . .

# 暴露端口（如果需要 Webhook 或 Express）
EXPOSE ${PORT}

# 启动 Bot
CMD ["sh", "-c", "mkdir -p /log && node index.js >> /log/bot.log 2>&1"]
