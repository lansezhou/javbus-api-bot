const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 使用环境变量
const token = process.env.TELEGRAM_TOKEN;  // Telegram Bot Token
const API_BASE_URL = process.env.API_BASE_URL;  // API 地址

if (!token) {
  console.error('[ERROR] TELEGRAM_TOKEN not set.');
  process.exit(1);
}
if (!API_BASE_URL) {
  console.error('[ERROR] API_BASE_URL not set.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// 项目地址：https://github.com/wensley/javbus-api-bot

// 发送请求的函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({
      ...options,
      url,
    });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] Error sending request to ${url}:`, error);
    console.error('Status:', error.response ? error.response.status : 'Unknown');
    console.error('Data:', error.response ? error.response.data : 'No response');
    console.error('Message:', error.message);
    throw error;
  }
}

// 处理 /start 指令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] User ${msg.from.username} started the bot.`);
  bot.sendMessage(chatId, 'Welcome to the @avgifbusbot ! Use /help to see available commands.');
});

// 处理 /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] User ${msg.from.username} requested help.`);
  const helpMessage = `
Available commands:
/search [keyword] - Search movies by keyword
/id [id] - Get movie details and magnet links by ID
/star [id] - Get star details by ID
/starsearch [keyword] - Search stars by keyword
/starpage [id] [page] - Get star movies by page
/latest - Get the latest movies
`;
  bot.sendMessage(chatId, helpMessage);
});

// 搜索电影
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] User ${msg.from.username} searched for "${query}".`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, {
      params: { keyword: query }
    });
    const movies = data.movies;
    let message = 'Search results:\n';
    movies.forEach(movie => {
      message += `\nTitle: ${movie.title}\nID: ${movie.id}\nDate: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] Error fetching search results: ${error.message}`);
    bot.sendMessage(chatId, 'Error fetching data from API');
  }
});

// 获取电影详情和磁力链接
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] User ${msg.from.username} requested details for movie ID: ${movieId}`);
  
  try {
    console.log(`[INFO] Fetching movie with ID: ${movieId}`);
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const tags = movie.tags ? movie.tags.join(', ') : 'N/A';
    const genres = movie.genres ? movie.genres.map(genre => genre.name).join(', ') : 'N/A';
    const stars = movie.stars ? movie.stars.map(star => star.name).join(', ') : 'N/A';
    const image = movie.img || null;
    
    let message = `
【Title】 <code>${title}</code>
【Code】 <code>${movieId}</code>
【Date】 <code>${date}</code>
`;
    if (movie.stars && movie.stars.length > 0) {
      message += '【Actor】 ';
      movie.stars.forEach((star, index) => {
        message += `<code>${star.name}</code>${index < movie.stars.length - 1 ? ' | ' : ''}`;
      });
      message += '\n';
    }
    message += `【Tags】 <code>${tags}</code>\n`;

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
        message += `【Magnet】 ${movie.videoLength || 'N/A'}分钟 ${formattedSize}\n`;
        magnets.slice(0, 3).forEach((magnet, index) => {
          message += `【magnet Links ${index + 1}】 <code>${magnet.link}</code>\n`;
        });
      } else {
        message += '【Magnet】 No magnet links available.\n';
      }
    } catch (error) {
      console.error(`[ERROR] Error fetching magnet links: ${error.message}`);
      message += '【Magnet】 Error fetching magnet links.\n';
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
        throw new Error('No image available');
      }
    } catch (error) {
      console.error(`[ERROR] Error sending photo: ${error.message}`);
      await bot.sendMessage(chatId, message, options);
      }
    } catch (error) {
    console.error(`[ERROR] Error fetching movie data: ${error.message}`);
    await bot.sendMessage(chatId, 'Error fetching data from API.');
  }
});

// 搜索演员
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] User ${msg.from.username} searched for star: "${query}".`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/search`, {
      params: { keyword: query }
    });
    const stars = data.stars;
    let message = 'Search results:\n';
    stars.forEach(star => {
      message += `\nName: ${star.name}\nID: ${star.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] Error fetching star search results: ${error.message}`);
    bot.sendMessage(chatId, 'Error fetching data from API');
  }
});

// 获取演员电影按页
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page] = match[1].split(' ');
  console.log(`[INFO] User ${msg.from.username} requested movies for star ID: ${starId} on page ${page}`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies`, {
      params: { page }
    });
    const movies = data.movies;
    let message = 'Star movies:\n';
    movies.forEach(movie => {
      message += `\nTitle: ${movie.title}\nID: ${movie.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] Error fetching star movies: ${error.message}`);
    bot.sendMessage(chatId, 'Error fetching star movies from API');
  }
});

// 获取最新电影
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] User ${msg.from.username} requested latest movies.`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`);
    const movies = data.movies;
    let message = 'Latest movies:\n';
    movies.forEach(movie => {
      message += `\nTitle: ${movie.title}\nID: ${movie.id}\nDate: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] Error fetching latest movies: ${error.message}`);
    bot.sendMessage(chatId, 'Error fetching latest movies from API');
  }
});

// 处理其他未识别的指令
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] User ${msg.from.username} sent an unrecognized message: ${msg.text}`);
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, 'Unrecognized command. Use /help to see available commands.');
  }
});

// 处理样品图像按钮点击事件
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);
    console.log(`[INFO] User ${query.from.username} (ID: ${query.from.id}) requested sample images for movie ID: ${movieId}, page: ${page}`);
    
    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      console.log(`[INFO] Successfully fetched movie data for ID: ${movieId}`);
      
      if (movie.samples && movie.samples.length > 0) {
        const startIndex = page * 5;
        const endIndex = Math.min(startIndex + 5, movie.samples.length);
        const samples = movie.samples.slice(startIndex, endIndex);
        
        console.log(`[INFO] Sending ${samples.length} sample images for movie ID: ${movieId}, page: ${page}`);
        
        // 创建媒体组
        const mediaGroup = samples.map(sample => ({
          type: 'photo',
          media: sample.src
        }));
        
        // 发送媒体组
        await bot.sendMediaGroup(chatId, mediaGroup);
        console.log(`[INFO] Successfully sent media group to user ${query.from.username} (ID: ${query.from.id})`);
        
        // 如果还有更多图片，添加"下一页"按钮
        if (endIndex < movie.samples.length) {
          await bot.sendMessage(chatId, '查看更多截图', {
            reply_markup: {
              inline_keyboard: [[
                { text: '下一页', callback_data: `sample_${movieId}_${page + 1}` }
              ]]
            }
          });
          console.log(`[INFO] Sent "Next Page" button for movie ID: ${movieId}, next page: ${page + 1}`);
        } else {
          console.log(`[INFO] No more pages available for movie ID: ${movieId}`);
        }
      } else {
        await bot.sendMessage(chatId, '没有可用的截图。');
        console.log(`[INFO] No samples available for movie ID: ${movieId}`);
      }
    } catch (error) {
      console.error(`[ERROR] Error fetching sample images for movie ID ${movieId}: ${error.message}`);
      await bot.sendMessage(chatId, '获取截图时出错。');
    }
    
    // 回应回调查询以消除加载状态
    await bot.answerCallbackQuery(query.id);
    console.log(`[INFO] Answered callback query for user ${query.from.username} (ID: ${query.from.id})`);
  }
});

module.exports = bot;
