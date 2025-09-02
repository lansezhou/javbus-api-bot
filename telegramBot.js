const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 使用固定环境变量
const token = process.env.TG_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;

if (!token || !API_BASE_URL) {
  console.error("请设置环境变量 TG_BOT_TOKEN 和 API_BASE_URL");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// 发送请求的函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({ url, ...options });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    throw error;
  }
}

// /start 指令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎使用 Javbus Bot！使用 /help 查看可用命令。');
});

// /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
可用命令:
/c [番号] - 通过番号查询影片全部信息
`;
  bot.sendMessage(chatId, helpMessage);
});

// /c [番号] 命令
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();

  try {
    // 获取影片详情
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);

    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const videoLength = movie.videoLength || 'N/A';
    const tags = movie.tags ? movie.tags.join(', ') : 'N/A';
    const genres = movie.genres ? movie.genres.map(g => g.name).join(', ') : 'N/A';
    const stars = movie.stars ? movie.stars.map(s => s.name).join(', ') : 'N/A';
    const image = movie.img || null;

    let message = `
【标题】 <code>${title}</code>
【番号】 <code>${movieId}</code>
【日期】 <code>${date}</code>
【时长】 <code>${videoLength} 分钟</code>
【分类】 <code>${genres}</code>
【演员】 <code>${stars}</code>
【标签】 <code>${tags}</code>
`;

    // 获取磁力链接（如果有 gid/uc）
    let magnets = [];
    if (movie.gid && movie.uc) {
      try {
        magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
          params: { gid: movie.gid, uc: movie.uc }
        });
      } catch (err) {
        console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
      }
    }

    if (magnets && magnets.length > 0) {
      magnets.slice(0, 3).forEach((magnet, index) => {
        message += `【磁力链接 ${index + 1}】 <code>${magnet.link}</code> (${magnet.size}${magnet.isHD ? ' HD' : ''}${magnet.hasSubtitle ? ' 字幕' : ''})\n`;
      });
    } else {
      message += '【磁力链接】暂无可用磁力链接\n';
    }

    // 发送封面图片 + 信息
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: []
      }
    };

    if (image) {
      await bot.sendPhoto(chatId, image, { caption: message, ...options });
    } else {
      await bot.sendMessage(chatId, message, options);
    }

    // 发送样品截图（最多前5张）
    if (movie.samples && movie.samples.length > 0) {
      const mediaGroup = movie.samples.slice(0, 5).map(sample => ({
        type: 'photo',
        media: sample.src
      }));
      await bot.sendMediaGroup(chatId, mediaGroup);
    }

  } catch (error) {
    console.error(`[ERROR] 获取影片 ${movieId} 失败: ${error.message}`);
    bot.sendMessage(chatId, `未能获取番号 <code>${movieId}</code> 的影片信息`, { parse_mode: "HTML" });
  }
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '未知命令，请使用 /help 查看可用命令。');
  }
});

module.exports = bot;
