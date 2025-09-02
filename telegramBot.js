const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 使用环境变量
const token = process.env.TELEGRAM_TOKEN;  // Telegram Bot Token
const API_BASE_URL = process.env.API_BASE_URL;  // API 地址

if (!token) {
  console.error('[ERROR] TELEGRAM_TOKEN 未设置');
  process.exit(1);
}
if (!API_BASE_URL) {
  console.error('[ERROR] API_BASE_URL 未设置');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// 发送请求的函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({
      ...options,
      url,
    });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error);
    throw error;
  }
}

// 处理 /start 指令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 启动了机器人`);
  bot.sendMessage(chatId, '欢迎使用 @avgifbusbot！请输入 /help 查看可用命令。');
});

// 处理 /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求帮助`);
  const helpMessage = `
可用指令：
/search [关键字] - 搜索影片
/id [番号] - 获取影片详细信息
/star [番号] - 获取指定女优的作品
/starsearch [关键字] - 搜索女优
/starpage [番号] [页码] - 获取指定番号更多作品
/latest - 获取最新 AV 作品
`;
  bot.sendMessage(chatId, helpMessage);
});

// 搜索影片
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索影片: "${query}"`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, {
      params: { keyword: query }
    });
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
    console.error(`[ERROR] 搜索影片失败: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据出错，请稍后重试。');
  }
});

// 获取影片详情和磁力链接
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
`;
    if (movie.stars && movie.stars.length > 0) {
      message += '【女优】 ';
      movie.stars.forEach((star, index) => {
        message += `<code>${star.name}</code>${index < movie.stars.length - 1 ? ' | ' : ''}`;
      });
      message += '\n';
    }
    message += `【标签】 <code>${tags}</code>\n`;
// 获取磁力链接
    let magnets = [];
    try {
      magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
        params: { gid: movie.gid, uc: movie.uc }
      });

      if (magnets && magnets.length > 0) {
        const fileSize = magnets[0].size;
        const formatSize = (sizeString) => {
          const size = parseFloat(sizeString);
          const unit = sizeString.replace(/[0-9.]/g, '').trim().toUpperCase();
          if (unit === 'GB') return `${size.toFixed(2)} GB`;
          else if (unit === 'MB') return `${(size / 1024).toFixed(2)} GB`;
          else return `${size} ${unit}`;
        };
        const formattedSize = formatSize(fileSize);
        message += `【影片时长/大小】 ${movie.videoLength || 'N/A'}分钟 ${formattedSize}\n`;
        magnets.slice(0, 3).forEach((magnet, index) => {
          message += `【磁力链接 ${index + 1}】 <code>${magnet.link}</code>\n`;
        });
      } else {
        message += '【磁力链接】暂无可用链接。\n';
      }
    } catch (error) {
      console.error(`[ERROR] 获取磁力链接失败: ${error.message}`);
      message += '【磁力链接】获取失败。\n';
    }

    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "预览截图", callback_data: `sample_${movieId}_0` },
            ...(magnets && magnets.length > 0 ? [
              {
                text: "在线播放",
                url: `https://keepshare.org/gc6ia801/${encodeURIComponent(magnets[0].link)}`
              }
            ] : [])
          ]
        ]
      }
    };

    try {
      if (image) {
        await bot.sendPhoto(chatId, image, { caption: message, ...options });
      } else {
        await bot.sendMessage(chatId, message, options);
      }
    } catch (error) {
      console.error(`[ERROR] 发送影片消息失败: ${error.message}`);
      await bot.sendMessage(chatId, message, options);
    }
  } catch (error) {
    console.error(`[ERROR] 获取影片数据失败: ${error.message}`);
    await bot.sendMessage(chatId, '从 API 获取影片数据失败，请稍后重试。');
  }
});

// 搜索演员
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索女优: "${query}"`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/search`, {
      params: { keyword: query }
    });
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

// 获取演员电影按页
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page] = match[1].split(' ');
  console.log(`[INFO] 用户 ${msg.from.username} 请求女优 ID ${starId} 第 ${page} 页影片`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies`, {
      params: { page }
    });
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

// 获取最新影片
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

// 未识别指令
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '未识别的命令，请使用 /help 查看可用指令。');
  }
});

// 样片按钮
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


  
