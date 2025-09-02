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

const bot = new TelegramBot(token, { polling: true });

// 发送请求函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({ ...options, url });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    throw new Error(`API请求失败: ${error.message}`);
  }
}

// /start 指令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎使用 @avgifbusbot！使用 /help 查看可用命令。');
});

// /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
可用命令:
/search [关键词] - 按关键词搜索影片（包含有无磁力链接）
/id [编号] - 按编号获取影片详情和磁力链接
/star [编号] - 按编号获取演员详情
/starsearch [关键词] - 按关键词搜索演员
/starpage [编号] [页数] - 获取演员影片列表（分页，包含有无磁力链接）
/latest - 获取最新影片（包含有无磁力链接）
`;
  bot.sendMessage(chatId, helpMessage);
});

// /search 指令
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1].trim();
  if (!keyword) return bot.sendMessage(chatId, '请提供影片关键词');

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, {
      params: { keyword, magnet: 'all' }
    });
    const movies = data.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, '未找到影片。');

    let message = '搜索结果:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (err) {
    console.error('[ERROR] /search 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '查询影片出错，请稍后重试。');
  }
});

// /id 指令
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();
  if (!movieId) return bot.sendMessage(chatId, '请提供影片编号');

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const stars = movie.stars?.map(s => s.name).join(', ') || 'N/A';
    const tags = movie.tags?.join(', ') || 'N/A';
    const image = movie.img || null;

    let message = `标题: ${title}\n编号: ${movieId}\n日期: ${date}\n演员: ${stars}\n标签: ${tags}\n`;

    // 判断是否有 gid 和 uc
    if (movie.gid && movie.uc) {
      try {
        const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}`, {
          params: { gid: movie.gid, uc: movie.uc }
        });
        if (magnets && magnets.length > 0) {
          magnets.slice(0, 3).forEach((m, idx) => {
            message += `磁力 ${idx + 1}: ${m.link}\n`;
          });
        } else {
          message += '磁力: 无可用磁力链接\n';
        }
      } catch (err) {
        console.error(`[ERROR] /id 获取磁力链接出错: ${movieId}`, err.message);
        message += '磁力: 获取失败\n';
      }
    }

    if (image) {
      await bot.sendPhoto(chatId, image, { caption: message });
    } else {
      await bot.sendMessage(chatId, message);
    }
  } catch (err) {
    console.error('[ERROR] /id 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '获取影片详情出错');
  }
});

// /star 指令
bot.onText(/\/star (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const starId = match[1].trim();
  if (!starId) return bot.sendMessage(chatId, '请提供演员编号');

  try {
    const star = await sendRequest(`${API_BASE_URL}/stars/${starId}`);
    const message = `
姓名: ${star.name || 'N/A'}
生日: ${star.birthday || 'N/A'}
年龄: ${star.age || 'N/A'}
身高: ${star.height || 'N/A'}
三围: ${star.bust || 'N/A'}-${star.waistline || 'N/A'}-${star.hipline || 'N/A'}
编号: ${star.id || 'N/A'}
`;
    if (star.avatar) {
      await bot.sendPhoto(chatId, star.avatar, { caption: message });
    } else {
      await bot.sendMessage(chatId, message);
    }
  } catch (err) {
    console.error('[ERROR] /star 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '获取演员详情出错');
  }
});

// /starsearch 指令
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1].trim();
  if (!keyword) return bot.sendMessage(chatId, '请提供演员关键词');

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, { params: { keyword, magnet: 'all' } });
    const movies = data.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, '未找到相关影片或演员');

    const actorMap = new Map();
    movies.forEach(movie => {
      movie.stars?.forEach(star => {
        if (star.name.includes(keyword)) {
          const key = `${movie.id}_${star.name}`;
          actorMap.set(key, star.name);
        }
      });
    });

    if (actorMap.size === 0) return bot.sendMessage(chatId, '未找到相关演员');

    let message = `搜索关键词: ${keyword} 的演员列表:\n`;
    actorMap.forEach((name, id) => {
      message += `\n姓名: ${name}\n编号: ${id}\n`;
    });

    bot.sendMessage(chatId, message);
  } catch (err) {
    console.error('[ERROR] /starsearch 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '搜索演员出错，请稍后重试');
  }
});

// /starpage 指令
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page = 1] = match[1].split(' ');
  if (!starId) return bot.sendMessage(chatId, '请提供演员编号');

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`, {
      params: { filterType: 'star', filterValue: starId, magnet: 'all', page }
    });
    const movies = data.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, '未找到影片');

    let message = `演员 ${starId} 的影片列表（第 ${page} 页）:\n`;
    movies.forEach(m => {
      message += `\n标题: ${m.title}\n编号: ${m.id}\n日期: ${m.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (err) {
    console.error('[ERROR] /starpage 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '获取演员影片列表出错');
  }
});

// /latest 指令
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`, { params: { magnet: 'all' } });
    const movies = data.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, '未找到最新影片');

    let message = '最新影片:\n';
    movies.forEach(m => {
      message += `\n标题: ${m.title}\n编号: ${m.id}\n日期: ${m.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (err) {
    console.error('[ERROR] /latest 调用 API 出错:', err.message);
    bot.sendMessage(chatId, '获取最新影片出错');
  }
});

// 未识别命令
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '无法识别的命令。使用 /help 查看可用命令。');
  }
});

module.exports = bot;
