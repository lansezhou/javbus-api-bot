const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 使用环境变量
const token = process.env.TELEGRAM_TOKEN;  // Telegram Bot Token
let API_BASE_URL = process.env.API_BASE_URL;  // API 地址，如 https://example.com/api
const JAVBUS_AUTH_TOKEN = process.env.JAVBUS_AUTH_TOKEN || '';

if (!token) {
  console.error('[ERROR] TELEGRAM_TOKEN 未设置');
  process.exit(1);
}
if (!API_BASE_URL) {
  console.error('[ERROR] API_BASE_URL 未设置');
  process.exit(1);
}

// 确保 API_BASE_URL 结尾没有 '/'
API_BASE_URL = API_BASE_URL.replace(/\/+$/, '');

const bot = new TelegramBot(token, { polling: true });

// 发送请求函数，自动带 token
async function sendRequest(url, options = {}) {
  const headers = options.headers || {};
  if (JAVBUS_AUTH_TOKEN) {
    headers['j-auth-token'] = JAVBUS_AUTH_TOKEN;
  }
  try {
    const response = await axios({
      ...options,
      headers,
      url,
    });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.response?.data || error.message);
    throw error;
  }
}

// ================== /start ==================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 启动了机器人`);
  bot.sendMessage(chatId, '欢迎使用 @avgifbusbot！请输入 /help 查看可用命令。');
});

// ================== /help ==================
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求帮助`);
  const helpMessage = `
可用指令：
/search [关键字] - 搜索影片
/id [番号] - 获取影片详细信息
/star [番号] - 获取指定女优的作品
/starsearch [关键字] - 搜索女优
/starpage [女优ID] [页码] - 获取指定女优更多作品
/latest - 获取最新 AV 作品
`;
  bot.sendMessage(chatId, helpMessage);
});

// ================== /search ==================
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索影片: "${query}"`);

  try {
    const url = `${API_BASE_URL}/movies/search?keyword=${encodeURIComponent(query)}`;
    const data = await sendRequest(url);
    const movies = data.movies;

    if (!movies || movies.length === 0) {
      bot.sendMessage(chatId, '未找到相关影片。');
      return;
    }

    let message = '搜索结果:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n番号: ${movie.id}\n发行日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// ================== /id ==================
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 请求影片详情: ${movieId}`);

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const tags = movie.tags ? movie.tags.join(', ') : 'N/A';
    const stars = movie.stars ? movie.stars.map(star => star.name).join(', ') : 'N/A';
    const image = movie.img || null;

    let message = `
【标题】 <code>${title}</code>
【番号】 <code>${movieId}</code>
【发行日期】 <code>${date}</code>
【女优】 ${stars}
【标签】 <code>${tags}</code>
【影片时长】 ${movie.videoLength || 'N/A'} 分钟
`;

    // 获取磁力链接
    if (movie.gid && movie.uc) {
      try {
        const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
          params: { gid: movie.gid, uc: movie.uc }
        });

        if (magnets && magnets.length > 0) {
          magnets.slice(0, 3).forEach((magnet, index) => {
            message += `【磁力链接 ${index + 1}】 <code>${magnet.link}</code>\n`;
          });
        } else {
          message += '【磁力链接】暂无可用链接。\n';
        }
      } catch (err) {
        console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
        message += '【磁力链接】获取失败。\n';
      }
    }

    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "预览截图", callback_data: `sample_${movieId}_0` }]
        ]
      }
    };

    if (image) {
      await bot.sendPhoto(chatId, image, { caption: message, ...options });
    } else {
      await bot.sendMessage(chatId, message, options);
    }
  } catch (error) {
    console.error(`[ERROR] 获取影片数据失败: ${error.message}`);
    await bot.sendMessage(chatId, '从 API 获取影片数据失败，请稍后重试。');
  }
});

// ================== /starsearch ==================
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索女优: "${query}"`);

  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/search?keyword=${encodeURIComponent(query)}`);
    const stars = data.stars;

    if (!stars || stars.length === 0) {
      bot.sendMessage(chatId, '未找到相关女优。');
      return;
    }

    let message = '搜索结果:\n';
    stars.forEach(star => {
      message += `\n姓名: ${star.name}\nID: ${star.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 搜索女优失败: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// ================== /star ==================
// 根据影片番号获取女优作品
bot.onText(/\/star (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 请求番号 ${movieId} 的女优作品`);

  try {
    // 先获取影片详情
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    if (!movie.stars || movie.stars.length === 0) {
      bot.sendMessage(chatId, '影片没有找到女优信息。');
      return;
    }

    const starId = movie.stars[0].id; // 默认取第一位女优
    const starName = movie.stars[0].name;

    // 获取该女优作品
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies`);
    const movies = data.movies;

    if (!movies || movies.length === 0) {
      bot.sendMessage(chatId, `${starName} 没有找到影片。`);
      return;
    }

    let message = `${starName} 的作品:\n`;
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n番号: ${movie.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取女优作品失败: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// ================== /starpage ==================
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page] = match[1].split(' ');
  console.log(`[INFO] 用户 ${msg.from.username} 请求女优 ID ${starId} 第 ${page} 页影片`);

  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies?page=${page}`);
    const movies = data.movies;

    if (!movies || movies.length === 0) {
      bot.sendMessage(chatId, '未找到相关影片。');
      return;
    }

    let message = '女优作品:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n番号: ${movie.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取女优影片失败: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// ================== /latest ==================
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求最新影片`);

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`);
    const movies = data.movies;

    if (!movies || movies.length === 0) {
      bot.sendMessage(chatId, '暂无最新影片。');
      return;
    }

    let message = '最新影片:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n番号: ${movie.id}\n发行日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取最新影片失败: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// ================== 未识别命令 ==================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '未识别的命令，请使用 /help 查看可用指令。');
  }
});

// ================== 样片按钮 ==================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);

    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      if (movie.samples && movie.samples.length > 0) {
        const startIndex = page * 5;
        const endIndex = Math.min(startIndex + 5, movie.samples.length);
        const samples = movie.samples.slice(startIndex, endIndex);

        const mediaGroup = samples.map(sample => ({
          type: 'photo',
          media: sample.src
        }));
        await bot.sendMediaGroup(chatId, mediaGroup);

        if (endIndex < movie.samples.length) {
          await bot.sendMessage(chatId, '查看更多截图', {
            reply_markup: {
              inline_keyboard: [[
                { text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }
              ]]
            }
          });
        }
      } else {
        await bot.sendMessage(chatId, '暂无可用截图。');
      }
    } catch (error) {
      console.error(`[ERROR] 获取样片失败: ${error.message}`);
      await bot.sendMessage(chatId, '获取样片时出错。');
    }

    await bot.answerCallbackQuery(query.id);
  }
});

module.exports = bot;


