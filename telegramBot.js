// telegramBot.js
const { Telegraf } = require("telegraf");
const axios = require("axios");

// ====== 环境变量 ======
const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;

if (!BOT_TOKEN || !API_BASE_URL) {
  console.error("[FATAL] 请设置环境变量 TG_BOT_TOKEN 和 API_BASE_URL");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ====== 通用请求函数 ======
async function sendRequest(endpoint, params = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await axios.get(url, { params });
    return res.data;
  } catch (err) {
    console.error(`[ERROR] 请求 ${url} 出错:`, err.message);
    throw new Error("API请求失败");
  }
}

// ====== 命令 ======

// /start
bot.start((ctx) => {
  ctx.reply("欢迎使用 JAV 搜索机器人！输入 /help 查看命令帮助。");
});

// /help
bot.command("help", (ctx) => {
  ctx.reply(`
可用命令:
/movies [page] 获取影片列表
/search <关键词> 搜索影片
/id <番号> 获取影片详情
/magnets <番号> 获取磁力链接
/star <演员ID> 获取演员详情
  `);
});

// /movies
bot.command("movies", async (ctx) => {
  const [, page = 1] = ctx.message.text.split(" ");
  try {
    const data = await sendRequest("/api/movies", { page, magnet: "all" });
    if (!data || !data.length) return ctx.reply("没有找到影片。");
    const msg = data.map((m) => `🎬 ${m.title}\n番号: ${m.id}`).join("\n\n");
    ctx.reply(msg);
  } catch {
    ctx.reply("❌ 获取影片失败");
  }
});

// /search
bot.command("search", async (ctx) => {
  const keyword = ctx.message.text.replace("/search", "").trim();
  if (!keyword) return ctx.reply("请输入关键词，例如 /search 三上");
  try {
    const data = await sendRequest("/api/movies/search", {
      keyword,
      magnet: "all",
    });
    if (!data || !data.length) return ctx.reply("没有找到相关影片。");
    const msg = data
      .map((m) => `🎬 ${m.title}\n番号: ${m.id}`)
      .join("\n\n");
    ctx.reply(msg);
  } catch {
    ctx.reply("❌ 搜索失败");
  }
});

// /id
bot.command("id", async (ctx) => {
  const movieId = ctx.message.text.replace("/id", "").trim();
  if (!movieId) return ctx.reply("请输入番号，例如 /id SSIS-406");
  try {
    const data = await sendRequest(`/api/movies/${movieId}`);
    ctx.reply(`🎬 ${data.title}\n番号: ${data.id}`);
  } catch {
    ctx.reply("❌ 获取影片详情失败");
  }
});

// /magnets
bot.command("magnets", async (ctx) => {
  const movieId = ctx.message.text.replace("/magnets", "").trim();
  if (!movieId) return ctx.reply("请输入番号，例如 /magnets SSNI-730");
  try {
    const data = await sendRequest(`/api/magnets/${movieId}`);
    if (!data || !data.length) return ctx.reply("没有找到磁力链接。");
    const msg = data
      .map((m) => `💾 ${m.name}\n磁链: ${m.link}`)
      .join("\n\n");
    ctx.reply(msg);
  } catch {
    ctx.reply("❌ 获取磁力失败");
  }
});

// /star
bot.command("star", async (ctx) => {
  const starId = ctx.message.text.replace("/star", "").trim();
  if (!starId) return ctx.reply("请输入演员ID，例如 /star 2xi");
  try {
    const data = await sendRequest(`/api/stars/${starId}`);
    ctx.reply(`🌟 ${data.name}\nID: ${starId}`);
  } catch {
    ctx.reply("❌ 获取演员详情失败");
  }
});

// ====== 启动 ======
bot.launch();
console.log(`[INFO] Bot 已启动，API: ${API_BASE_URL}`);
