// bot.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 使用环境变量配置
const API_BASE_URL = process.env.API_BASE_URL;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;

if (!API_BASE_URL || !TG_BOT_TOKEN) {
  console.error('请在环境变量中设置 API_BASE_URL 和 TG_BOT_TOKEN');
  process.exit(1);
}

const bot = new TelegramBot(TG_BOT_TOKEN, { polling: true });

// 发送请求函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({ ...options, url });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    throw error;
  }
}

// /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
可用命令:
/c [番号] - 查询影片详细信息和磁力链接
示例: /c MDS-828
`;
  bot.sendMessage(chatId, helpMessage);
});

// /c [番号] 指令
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] User ${msg.from.username} 请求番号: ${movieId}`);

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);

    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const stars = movie.stars ? movie.stars.map(s => s.name).join(', ') : 'N/A';
    const image = movie.img || null;

    // 获取磁力链接
    let magnets = [];
    try {
      magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
        params: { gid: movie.gid, uc: movie.uc }
      });
    } catch (err) {
      console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
    }

    // 构建消息
    let message = `<b>标题:</b> ${title}\n`;
    message += `<b>番号:</b> ${movieId}\n`;
    message += `<b>日期:</b> ${date}\n`;
    message += `<b>演员:</b> ${stars}\n\n`;

    if (magnets && magnets.length > 0) {
      message += `<b>磁力链接:</b>\n`;
      magnets.slice(0, 5).forEach((magnet, index) => {
        message += `${index + 1}. <code>${magnet.link}</code> (${magnet.size})\n`;
      });
    } else {
      message += '磁力链接暂无。\n';
    }

    // 按钮查看截图
    const options = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '查看截图', callback_data: `sample_${movieId}_0` }]
        ]
      }
    };

    if (image) {
      await bot.sendPhoto(chatId, image, { caption: message, ...options });
    } else {
      await bot.sendMessage(chatId, message, options);
    }

  } catch (error) {
    console.error(`[ERROR] 获取影片 ${movieId} 失败: ${error.message}`);
    bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
  }
});

// 样品截图分页
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);

    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);

      if (!movie.samples || movie.samples.length === 0) {
        await bot.sendMessage(chatId, '没有可用的截图。');
        return;
      }

      const startIndex = page * 5;
      const endIndex = Math.min(startIndex + 5, movie.samples.length);
      const samples = movie.samples.slice(startIndex, endIndex);

      const mediaGroup = samples.map(s => ({ type: 'photo', media: s.src }));
      await bot.sendMediaGroup(chatId, mediaGroup);

      if (endIndex < movie.samples.length) {
        await bot.sendMessage(chatId, '查看更多截图', {
          reply_markup: {
            inline_keyboard: [[{ text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }]]
          }
        });
      }

    } catch (error) {
      console.error(`[ERROR] 获取截图失败: ${error.message}`);
      await bot.sendMessage(chatId, '获取截图时出错。');
    }

    await bot.answerCallbackQuery(query.id);
  }
});

// 未识别消息
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '未识别的命令，请使用 /help 查看可用命令。');
  }
});

console.log('Bot 已启动...');
