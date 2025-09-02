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
  const MAX_LEN = 900; // Telegram 消息长度限制
  let msg = '';
  magnets.forEach((m, i) => {
    const line = `${i + 1}. ${m.link} (${formatSize(m.size)} | ${videoLength || 'N/A'} 分钟)\n`;
    if ((msg + line).length > MAX_LEN) {
      bot.sendMessage(chatId, msg);
      msg = '';
    }
    msg += line;
  });
  if (msg.length > 0) bot.sendMessage(chatId, msg);
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

    // 发送封面 + 基本信息（只包含标题/番号/日期）
    const caption = `🎬 ${title}\n编号: ${movieId}\n日期: ${date}`;
    if (image) {
      await bot.sendPhoto(chatId, image, { caption });
    } else {
      await bot.sendMessage(chatId, caption);
    }

    // 演员信息
    await bot.sendMessage(chatId, `演员: ${stars}`);

    // 获取磁力链接
    let magnets = [];
    try {
      magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, { params: { gid: movie.gid, uc: movie.uc } });
    } catch (err) {
      console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取磁力链接失败');
    }

    // 分段发送磁力链接
    if (magnets.length > 0) sendMagnets(bot, chatId, magnets, videoLength);

    // 样品截图按钮
    if (movie.samples && movie.samples.length > 0) {
      await bot.sendMessage(chatId, '还有更多截图，可使用按钮查看更多', {
        reply_markup: { inline_keyboard: [[{ text: '查看截图', callback_data: `sample_${movieId}_0` }]] }
      });
    }

  } catch (err) {
    console.error(`[ERROR] 获取影片 ${movieId} 失败: ${err.message}`);
    await bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
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
      if (mediaGroup.length > 0) await bot.sendMediaGroup(chatId, mediaGroup);

      // 下一页按钮
      if (end < samples.length) {
        await bot.sendMessage(chatId, '查看更多截图', {
          reply_markup: { inline_keyboard: [[{ text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }]] }
        });
      }

    } catch (err) {
      console.error(`[ERROR] 获取截图失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取截图时出错');
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
显示内容:
- 封面图 + 标题 + 番号 + 日期
- 演员
- 磁力链接（文件大小 + 时长）
- 样品截图按钮
`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot 已启动...');
module.exports = bot;
