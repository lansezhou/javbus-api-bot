const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = '123456789:xxxxxxxxxxxxxxxxxxxxxx';  // 请替换为您的Telegram Bot Token
const bot = new TelegramBot(token, { polling: true });
const API_BASE_URL = 'https://xyz.xyz.xyz/api';  // 替换为您的API URL

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
    console.error('状态码:', error.response ? error.response.status : '未知');
    console.error('返回数据:', error.response ? error.response.data : '无响应数据');
    console.error('错误信息:', error.message);
    throw error;
  }
}

// 处理 /start 指令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 启动了机器人.`);
  bot.sendMessage(chatId, '欢迎使用 @avgifbusbot！使用 /help 查看可用命令。');
});

// 处理 /help 指令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求帮助.`);
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

// 搜索电影
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索影片: "${query}"`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies/search`, {
      params: { keyword: query }
    });
    const movies = data.movies;
    let message = '搜索结果:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取搜索结果出错: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据时出错');
  }
});

// 获取电影详情和磁力链接
bot.onText(/\/id (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 请求影片编号: ${movieId}`);
  
  try {
    console.log(`[INFO] 获取影片信息 ID: ${movieId}`);
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    const title = movie.title || 'N/A';
    const date = movie.date || 'N/A';
    const tags = movie.tags ? movie.tags.join(', ') : 'N/A';
    const genres = movie.genres ? movie.genres.map(genre => genre.name).join(', ') : 'N/A';
    const stars = movie.stars ? movie.stars.map(star => star.name).join(', ') : 'N/A';
    const image = movie.img || null;
    
    let message = `
【标题】 <code>${title}</code>
【编号】 <code>${movieId}</code>
【日期】 <code>${date}</code>
`;
    if (movie.stars && movie.stars.length > 0) {
      message += '【演员】 ';
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
        // 使用第一个磁力链接的大小
        const fileSize = magnets[0].size;
        
        // 格式化文件大小
        const formatSize = (sizeString) => {
          const size = parseFloat(sizeString);
          const unit = sizeString.replace(/[0-9.]/g, '').trim().toUpperCase();
          
          if (unit === 'GB') {
            return `${size.toFixed(2)} GB`;
          } else if (unit === 'MB') {
            return `${(size / 1024).toFixed(2)} GB`;
          } else {
            return `${size} ${unit}`;
          }
        };

        const formattedSize = formatSize(fileSize);
        message += `【磁力】 ${movie.videoLength || 'N/A'}分钟 ${formattedSize}\n`;
        magnets.slice(0, 3).forEach((magnet, index) => {
          message += `【磁力链接 ${index + 1}】 <code>${magnet.link}</code>\n`;
        });
      } else {
        message += '【磁力】 无可用磁力链接.\n';
      }
    } catch (error) {
      console.error(`[ERROR] 获取磁力链接出错: ${error.message}`);
      message += '【磁力】 获取磁力链接出错.\n';
    }


    // 发送电影详情消息
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "预览截图", callback_data: `sample_${movieId}_0` }
          ]
        ]
      }
    };

    try {
      if (image) {
        await bot.sendPhoto(chatId, image, { caption: message, ...options });
      } else {
        throw new Error('无可用图片');
      }
    } catch (error) {
      console.error(`[ERROR] 发送图片出错: ${error.message}`);
      // 如果发送图片失败，就只发送文字消息
      await bot.sendMessage(chatId, message, options);
    }

  } catch (error) {
    console.error(`[ERROR] 获取影片信息出错: ${error.message}`);
    await bot.sendMessage(chatId, '从 API 获取影片数据时出错.');
  }
});

// 搜索演员
bot.onText(/\/starsearch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`[INFO] 用户 ${msg.from.username} 搜索演员: "${query}"`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/search`, {
      params: { keyword: query }
    });
    const stars = data.stars;
    let message = '搜索结果:\n';
    stars.forEach(star => {
      message += `\n姓名: ${star.name}\n编号: ${star.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取演员搜索结果出错: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取数据时出错');
  }
});

// 获取演员电影按页
bot.onText(/\/starpage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [starId, page] = match[1].split(' ');
  console.log(`[INFO] 用户 ${msg.from.username} 请求演员编号: ${starId} 第 ${page} 页影片`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/stars/${starId}/movies`, {
      params: { page }
    });
    const movies = data.movies;
    let message = '演员影片列表:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取演员影片出错: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取演员影片数据时出错');
  }
});

// 获取最新电影
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求最新影片.`);
  try {
    const data = await sendRequest(`${API_BASE_URL}/movies`);
    const movies = data.movies;
    let message = '最新影片:\n';
    movies.forEach(movie => {
      message += `\n标题: ${movie.title}\n编号: ${movie.id}\n日期: ${movie.date}\n`;
    });
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(`[ERROR] 获取最新影片出错: ${error.message}`);
    bot.sendMessage(chatId, '从 API 获取最新影片数据时出错');
  }
});

// 处理其他未识别的指令
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 发送未识别消息: ${msg.text}`);
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(chatId, '无法识别的命令。使用 /help 查看可用命令。');
  }
});

// 处理样品图像按钮点击事件
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (data.startsWith('sample_')) {
    const [_, movieId, pageStr] = data.split('_');
    const page = parseInt(pageStr);
    console.log(`[INFO] 用户 ${query.from.username} 请求影片 ID: ${movieId} 截图页: ${page}`);
    
    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      
      if (movie.samples && movie.samples.length > 0) {
        const startIndex = page * 5;
        const endIndex = Math.min(startIndex + 5, movie.samples.length);
        const samples = movie.samples.slice(startIndex, endIndex);
        
        // 创建媒体组
        const mediaGroup = samples.map(sample => ({
          type: 'photo',
          media: sample.src
        }));
        
        // 发送媒体组
        await bot.sendMediaGroup(chatId, mediaGroup);
        
        // 如果还有更多图片，添加"下一页"按钮
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
        await bot.sendMessage(chatId, '没有可用的截图。');
      }
    } catch (error) {
      console.error(`[ERROR] 获取影片截图出错 ID: ${movieId} 错误: ${error.message}`);
      await bot.sendMessage(chatId, '获取截图时出错。');
    }
    
    // 回应回调查询以消除加载状态
    await bot.answerCallbackQuery(query.id);
  }
});

module.exports = bot;


