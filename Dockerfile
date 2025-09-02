# 使用轻量 Node.js 基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY package*.json ./
RUN npm install --production

# 复制项目所有代码
COPY . .

# 设置默认环境变量（可覆盖）
ENV NODE_ENV=production

# 启动服务（看项目入口是 index.js）
CMD ["node", "index.js"]
