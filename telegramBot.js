const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
const API_BASE_URL = process.env.API_BASE_URL;

// 发送请求的函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({ ...options, url });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    throw error;
  }
}

// 格式化文件大小
function formatSize(size) {
  if (!size) return 'N/A';
  const unit = size.replace(/[0-9.]/g, '').trim().toUpperCase();
  const num = parseFloat(size);
  if (unit === 'GB') return `${num.toFixed(2)} GB`;
  if (unit === 'MB') return `${(num / 1024).toFixed(2)} GB`;
  return `${num} ${unit}`;
}

// 分段发送磁力链接
async function sendMagnets(bot, chatId, magnets, videoLength) {
  const MAX_CAPTION = 900;
  let message = '🧲 <b>磁力链接:</b>\n';
  for (let i = 0; i < magnets.length; i++) {
    const m = magnets[i];
    const line = `${i + 1}. <code>${m.link}</code> (${formatSize(m.size)} | ${videoLength || 'N/A'} 分钟)\n`;
    if ((message + line).length > MAX_CAPTION) {
      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      message = '';
    }
    message += line;
  }
  if (message.length > 0) {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }
}

// /c 命令: 查询影片信息
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();
  console.log(`[INFO] 用户 ${msg.from?.username} 查询番号: ${movieId}`);

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    if (!movie || !movie.id) {
      await bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
      return;
    }

    // 发送封面图（如果有）
    if (movie.img) {
      await bot.sendPhoto(chatId, movie.img);
    }

    // 基本信息（标题、番号、日期、演员）
    let infoMessage = `🎬 <b>${movie.title}</b>\n`;
    infoMessage += `编号: <code>${movie.id}</code>\n`;
    infoMessage += `日期: ${movie.date || 'N/A'}\n`;
    if (movie.stars && movie.stars.length > 0) {
      infoMessage += `演员: ${movie.stars.map(s => s.name).join(' | ')}\n`;
    }
    await bot.sendMessage(chatId, infoMessage, { parse_mode: 'HTML' });

    // 获取磁力链接
    let magnets = [];
    try {
      magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
        params: { gid: movie.gid, uc: movie.uc }
      });
    } catch (err) {
      console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
    }

    if (magnets && magnets.length > 0) {
      await sendMagnets(bot, chatId, magnets, movie.videoLength);
    } else {
      await bot.sendMessage(chatId, '🧲 未找到磁力链接');
    }

    // 样品截图按钮
    if (movie.samples && movie.samples.length > 0) {
      await bot.sendMessage(chatId, '还有更多截图，可使用按钮查看更多', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '查看截图', callback_data: `sample_${movieId}_0` }]
          ]
        }
      });
    }

  } catch (error) {
    console.error(`[ERROR] 获取影片 ${movieId} 失败: ${error.message}`);
    await bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
  }
});

// 样品截图翻页按钮
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);
    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      if (!movie.samples || movie.samples.length === 0) {
        await bot.sendMessage(chatId, '没有可用的截图');
        return;
      }
      const startIndex = page * 5;
      const endIndex = Math.min(startIndex + 5, movie.samples.length);
      const mediaGroup = movie.samples.slice(startIndex, endIndex).map(s => ({ type: 'photo', media: s.src }));
      await bot.sendMediaGroup(chatId, mediaGroup);

      // 下一页按钮
      if (endIndex < movie.samples.length) {
        await bot.sendMessage(chatId, '查看更多截图', {
          reply_markup: {
            inline_keyboard: [[{ text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }]]
          }
        });
      }
    } catch (err) {
      console.error(`[ERROR] 获取样品截图失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取截图时出错');
    }

    await bot.answerCallbackQuery(query.id);
  }
});

// /help 命令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
可用命令:
/c [番号] - 查询影片详细信息、磁力链接及样品截图
/help - 查看本帮助
`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot 已启动...');
module.exports = bot;
