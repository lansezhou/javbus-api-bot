require('dotenv').config(); // 可选，本地开发用 .env 文件

const express = require('express');
const app = express();
const port = process.env.PORT || 3033;

// 加载 Telegram Bot
require('./telegramBot');

app.get('/', (req, res) => {
  res.send('Welcome to Telegram Bot! Use /help to see available commands!');
});

app.listen(port, () => {
  console.log(`Bot server running at http://localhost:${port}`);
});
