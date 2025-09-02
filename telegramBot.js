const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 从环境变量读取 Token 和 API 地址
const token = process.env.TG_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;

if (!token) {
  console.error('[ERROR] TG_BOT_TOKEN 未设置');
  process.exit(1);
}

if (!API_BASE_URL) {
  console.error('[ERROR] API_BASE_URL 未设置');
  process.exit(1);
}

// 创建 Bot
const bot = new TelegramBot(token, { polling: true });

// ======== 统一发送请求函数 ========
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({ ...options, url, timeout: 5000 });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    const err = new Error(`API请求失败: ${error.message}`);
    err.apiUrl = url;
    throw err;
  }
}

// ======== 启动时检测 API 在线状态 ========
(async () => {
  try {
    await sendRequest(`${API_BASE_URL}/movies`);
    console.log('[INFO] 本地 API 在线，Bot 已启动');
  } catch (err) {
    console.error('[ERROR] 本地 API 离线，请检查部署:', err.message);
  }
})();

// ======== /start 指令 ========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎使用 @avgifbusbot！使用 /help 查看可用命令。');
});

// ======== /help 指令 ========
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
可用命令:
/search [关键词] - 按关键词搜索影片
/id [编号] - 按编号获取影片详情和磁力链接
/star [编号] - 按编号获取演员详情
/starsearch [关键词] - 按关键词搜索演员
/starpage [编号] [页数] - 获取演员影片列表（分页）
/latest - 获取最新影片
`;
  bot.sendMessage(chatId, helpMessage);
});

// ======== /search 指令 ========
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, { params: { keyword: query } });
    const movies = Array.isArray(data) ? data : data.movies;

    if (!movies || movies.length === 0) return bot.sendMessage(chatId, '未找到影片。');

    let message = '搜索结果:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);

  } catch (err) {
    console.error(`[ERROR] /search 调用 API 出错: ${err.apiUrl}`, err);
    bot.sendMessage(chatId, '从 API 获取数据时出错，请稍后重试。');
  }
});

// ======== /id 指令 ========
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const tags = movie.tags ? movie.tags.join(', ') : 'N/A';
    const stars = movie.stars ? movie.stars.map(s => s.name).join(', ') : 'N/A';
    const image = movie.img || null;

    let message = `
【标题】 <code>${title}</code>
【编号】 <code>${movieId}</code>
【日期】 <code>${date}</code>
【演员】 ${stars}
【标签】 <code>${tags}</code>
`;

    try {
      const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`);
      if (magnets && magnets.length > 0) {
        magnets.slice(0, 3).forEach((magnet, idx) => {
          message += `【磁力链接 ${idx + 1}】 <code>${magnet.link}</code>\n`;
        });
      } else {
        message += '【磁力】 无可用磁力链接\n';
      }
    } catch (err) {
      console.error(`[ERROR] /id 获取磁力链接失败: ${err.apiUrl}`, err);
      message += '【磁力】 获取磁力链接出错\n';
    }

    const options = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '预览截图', callback_data: `sample_${movieId}_0` }]]
      }
    };

    if (image) {
      await bot.sendPhoto(chatId, image, { caption: message, ...options });
    } else {
      await bot.sendMessage(chatId, message, options);
    }

  } catch (err) {
    console.error(`[ERROR] /id 调用 API 出错: ${err.apiUrl}`, err);
    bot.sendMessage(chatId, '从 API 获取影片数据时出错，请稍后重试。');
  }
});

// ======== /starsearch 指令 ========
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/search`, { params: { keyword: query } });
    const stars = data.stars;
    if (!stars || stars.length === 0) return bot.sendMessage(chatId, '未找到演员');

    let message = '搜索结果:\n';
    stars.forEach(star => {
      message += `\n姓名: ${star.name}\n编号: ${star.id}\n`;
    });
    bot.sendMessage(chatId, message);

  } catch (err) {
    console.error(`[ERROR] /starsearch 调用 API 出错: ${err.apiUrl}`, err);
    bot.sendMessage(chatId, '从 API 获取数据时出错，请稍后重试。');
  }
});

// ======== /starpage 指令 ========
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page] = match[1].split(' ');
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies`, { params: { page } });
    const movies = data.movies;
    if (!movies || movies.length === 0) return bot.sendMessage(chatId, '未找到影片');

    let message = '演员影片列表:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n`;
    });
    bot.sendMessage(chatId, message);

  } catch (err) {
    console.error(`[ERROR] /starpage 调用 API 出错: ${err.apiUrl}`, err);
    bot.sendMessage(chatId, '从 API 获取演员影片数据时出错，请稍后重试。');
  }
});

// ======== /latest 指令 ========
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`);
    const movies = data.movies;
    if (!movies || movies.length === 0) return bot.sendMessage(chatId, '未找到最新影片');

    let message = '最新影片:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);

  } catch (err) {
    console.error(`[ERROR] /latest 调用 API 出错: ${err.apiUrl}`, err);
    bot.sendMessage(chatId, '从 API 获取最新影片数据时出错，请稍后重试。');
  }
});

// ======== 未识别命令 ========
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '无法识别的命令。使用 /help 查看可用命令。');
  }
});

// ======== 样品图像分页 ========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);

    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      if (!movie.samples || movie.samples.length === 0) {
        await bot.sendMessage(chatId, '没有可用截图。');
        return;
      }

      const start = page * 5;
      const end = Math.min(start + 5, movie.samples.length);
      const samples = movie.samples.slice(start, end);
      const mediaGroup = samples.map(s => ({ type: 'photo', media: s.src }));
      await bot.sendMediaGroup(chatId, mediaGroup);

      if (end < movie.samples.length) {
        await bot.sendMessage(chatId, '查看更多截图', {
          reply_markup: {
            inline_keyboard: [[{ text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }]]
          }
        });
      }

    } catch (err) {
      console.error(`[ERROR] 样品图像分页出错: ${err.apiUrl}`, err);
      await bot.sendMessage(chatId, '获取截图时出错。');
    }

    await bot.answerCallbackQuery(query.id);
  }
});

module.exports = bot;
