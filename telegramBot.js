// telegramBot.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ================= 环境变量配置 =================
const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const API_BASE = process.env.API_BASE_URL || "http://localhost:8922/api";

// 检查必要环境变量
if (!TG_BOT_TOKEN || !API_BASE_URL) {
  console.error(
    "[FATAL] 缺少必要的环境变量，请检查 TG_BOT_TOKEN 和 API_BASE_URL 是否已配置"
  );
  process.exit(1);
}

console.log("[INFO] 使用的 API_BASE_URL:", API_BASE_URL);

// ================= 初始化 Bot =================
const bot = new TelegramBot(TG_BOT_TOKEN, { polling: true });

// ================= 通用请求函数 =================
async function sendRequest(apiUrl) {
  try {
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${apiUrl} 出错:`, error.message);
    throw new Error(`API请求失败: ${error.message}`);
  }
}

// ================= 命令处理 =================

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `欢迎使用 Javbus API Bot 🎬\n\n可用命令:\n
/help - 查看帮助
/movies - 获取影片列表
/search <关键词> - 搜索影片
/id <番号> - 获取影片详情
/magnets <番号> - 获取磁力链接
/star <演员ID> - 获取演员详情`
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📌 命令列表:\n
/movies - 获取第一页影片列表
/movies <页码> - 获取指定页码的影片
/search <关键词> - 搜索影片（返回全部结果）
/id <番号> - 获取影片详情
/magnets <番号> - 获取影片磁力链接
/star <演员ID> - 获取演员详情`
  );
});

// /movies [page]
bot.onText(/\/movies\s*(\d+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const page = match[1] || 1;
  const apiUrl = `${API_BASE}/movies?page=${page}&magnet=all`;

  try {
    const data = await sendRequest(apiUrl);
    if (data && data.data && data.data.length > 0) {
      const movies = data.data
        .map((m) => `🎬 ${m.title}\n番号: ${m.id}`)
        .join("\n\n");
      bot.sendMessage(chatId, `第 ${page} 页影片:\n\n${movies}`);
    } else {
      bot.sendMessage(chatId, "没有找到影片。");
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ 获取影片失败: ${err.message}`);
  }
});

// /search <keyword>
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1].trim();
  const apiUrl = `${API_BASE}/movies/search?keyword=${encodeURIComponent(
    keyword
  )}&magnet=all`;

  try {
    const data = await sendRequest(apiUrl);
    if (data && data.data && data.data.length > 0) {
      const results = data.data
        .map((m) => `🎬 ${m.title}\n番号: ${m.id}`)
        .join("\n\n");
      bot.sendMessage(chatId, `搜索结果 (${keyword}):\n\n${results}`);
    } else {
      bot.sendMessage(chatId, "没有找到相关影片。");
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ 搜索失败: ${err.message}`);
  }
});

// /id <movieId>
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();
  const apiUrl = `${API_BASE}/movies/${movieId}`;

  try {
    const data = await sendRequest(apiUrl);
    bot.sendMessage(
      chatId,
      `🎬 ${data.title}\n番号: ${data.id}\n发行日期: ${data.date}\n演员: ${
        data.actors?.join(", ") || "未知"
      }`
    );
  } catch (err) {
    bot.sendMessage(chatId, `❌ 获取影片详情失败: ${err.message}`);
  }
});

// /magnets <movieId>
bot.onText(/\/magnets (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();
  const apiUrl = `${API_BASE}/magnets/${movieId}?sortBy=date&sortOrder=desc`;

  try {
    const data = await sendRequest(apiUrl);
    if (data && data.data && data.data.length > 0) {
      const magnets = data.data
        .slice(0, 5)
        .map((m) => `🧲 ${m.link}\n大小: ${m.size}`)
        .join("\n\n");
      bot.sendMessage(chatId, `磁力链接 (前5个):\n\n${magnets}`);
    } else {
      bot.sendMessage(chatId, "没有找到磁力链接。");
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ 获取磁力链接失败: ${err.message}`);
  }
});

// /star <starId>
bot.onText(/\/star (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const starId = match[1].trim();
  const apiUrl = `${API_BASE}/stars/${starId}`;

  try {
    const data = await sendRequest(apiUrl);
    bot.sendMessage(
      chatId,
      `👩‍🎤 演员: ${data.name}\nID: ${starId}\n生日: ${
        data.birthday || "未知"
      }\n三围: ${data.measurements || "未知"}`
    );
  } catch (err) {
    bot.sendMessage(chatId, `❌ 获取演员详情失败: ${err.message}`);
  }
});

console.log("[INFO] Bot 已启动，等待指令中...");
