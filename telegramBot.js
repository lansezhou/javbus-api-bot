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
function sendMagnets(bot, chatId, magnets, videoLength) {
  const MAX_CAPTION = 900;
  let message = '';
  magnets.forEach((magnet, index) => {
    const line = `${index + 1}. <code>${magnet.link}</code> (${formatSize(magnet.size)} | ${videoLength || 'N/A'} 分钟)\n`;
    if ((message + line).length > MAX_CAPTION) {
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      message = '';
    }
    message += line;
  });
  if (message.length > 0) {
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }
}

// /c 命令
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] User ${msg.from?.username} 请求番号: ${movieId}`);

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const stars = movie.stars ? movie.stars.map(s => s.name).join(' | ') : 'N/A';
    const image = movie.img || null;
    const videoLength = movie.videoLength || 'N/A';

    // 获取磁力链接
    let magnets = [];
    try {
      magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, { params: { gid: movie.gid, uc: movie.uc } });
    } catch (error) {
      console.error(`[ERROR] 获取磁力链接失败: ${error.message}`);
    }

    // 发送封面 + 基本信息
    const caption = `<b>标题:</b> ${title}\n<b>番号:</b> ${movieId}\n<b>日期:</b> ${date}\n<b>演员:</b> ${stars}`;
    if (image) {
      await bot.sendPhoto(chatId, image, { caption, parse_mode: 'HTML' });
    } else {
      await bot.sendMessage(chatId, caption, { parse_mode: 'HTML' });
    }

    // 分段发送磁力链接
    if (magnets.length > 0) {
      sendMagnets(bot, chatId, magnets, videoLength);
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
    bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
  }
});

// 样品截图按钮点击
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);
    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      const samples = movie.samples || [];
      const start = page * 5;
      const end = Math.min(start + 5, samples.length);
      const mediaGroup = samples.slice(start, end).map(s => ({ type: 'photo', media: s.src }));
      await bot.sendMediaGroup(chatId, mediaGroup);

      // 下一页按钮
      if (end < samples.length) {
        await bot.sendMessage(chatId, '查看更多截图', {
          reply_markup: {
            inline_keyboard: [[{ text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }]]
          }
        });
      }
    } catch (error) {
      console.error(`[ERROR] 获取截图失败: ${error.message}`);
      bot.sendMessage(chatId, '获取截图时出错');
    }
    await bot.answerCallbackQuery(query.id);
  }
});

// /help 命令
bot.onText(/\/help/, msg => {
  const chatId = msg.chat.id;
  const helpMessage = `
使用 /c [番号] 查询影片详情及磁力链接
示例: /c MDS-828
磁力链接会显示文件大小和影片时长
封面图 + 基本信息 + 磁力链接 + 样品截图按钮
`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot 已启动...');
module.exports = bot;
