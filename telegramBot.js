const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 环境变量检查
if (!process.env.TG_BOT_TOKEN || !process.env.API_BASE_URL) {
  console.error('错误: 请设置TG_BOT_TOKEN和API_BASE_URL环境变量');
  process.exit(1);
}

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
const API_BASE_URL = process.env.API_BASE_URL;

// 发送请求的函数
async function sendRequest(url, options = {}) {
  try {
    const response = await axios({
      ...options,
      url,
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.error(`[ERROR] 请求 ${url} 出错:`, error.message);
    throw error;
  }
}

// /c 命令: 查询影片信息
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const movieId = match[1].trim();
  console.log(`[INFO] 用户 ${msg.from.username} 查询番号: ${movieId}`);

  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    if (!movie || !movie.id) {
      bot.sendMessage(chatId, `未能获取番号 ${movieId} 的影片信息`);
      return;
    }

    let message = `🎬 <b>${movie.title}</b>\n`;
    message += `编号: <code>${movie.id}</code>\n`;
    message += `日期: ${movie.date || 'N/A'}\n`;
    if (movie.stars && movie.stars.length > 0) {
      message += `演员: ${movie.stars.map(s => s.name).join(' | ')}\n`;
    }
    if (movie.tags && movie.tags.length > 0) {
      message += `标签: ${movie.tags.join(', ')}\n`;
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

    // 获取磁力链接
    try {
      const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}?gid=${movie.gid}&uc=${movie.uc}`);
      if (magnets && magnets.length > 0) {
        let magnetMsg = '🧲 <b>磁力链接:</b>\n';
        magnets.slice(0, 5).forEach((m, idx) => {
          magnetMsg += `${idx + 1}️⃣ [${m.size}] \n<code>${m.link}</code>\n\n`;
        });
        await bot.sendMessage(chatId, magnetMsg, { parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, '🧲 未找到磁力链接');
      }
    } catch (err) {
      console.error(`[ERROR] 获取磁力链接失败: ${err.message}`);
      await bot.sendMessage(chatId, '🧲 获取磁力链接出错');
    }

    // 样品截图按钮
    if (movie.samples && movie.samples.length > 0) {
      await bot.sendMessage(chatId, `还有更多截图，可使用按钮查看`, {
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

// 样品截图翻页 & 女优头像按钮
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 样品截图分页
  if (data.startsWith('sample_')) {
    const parts = data.split('_');
    if (parts.length < 3) {
      await bot.answerCallbackQuery(query.id, { text: '无效请求' });
      return;
    }

    const movieId = parts[1];
    const page = parseInt(parts[2]);

    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      if (!movie.samples || movie.samples.length === 0) {
        await bot.sendMessage(chatId, '没有可用的截图');
        return;
      }

      const startIndex = page * 5;
      const endIndex = Math.min(startIndex + 5, movie.samples.length);

      if (startIndex >= movie.samples.length) {
        await bot.answerCallbackQuery(query.id, { text: '已经是最后一页' });
        return;
      }

      const samples = movie.samples.slice(startIndex, endIndex);
      const mediaGroup = samples.map(s => ({ type: 'photo', media: s.src }));
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
    } catch (err) {
      console.error(`[ERROR] 获取样品截图失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取截图时出错');
    }

    await bot.answerCallbackQuery(query.id);
  }

  // 女优头像
  if (data.startsWith('star_avatar_')) {
    const starId = data.replace('star_avatar_', '');
    try {
      const star = await sendRequest(`${API_BASE_URL}/stars/${starId}`);
      if (star && star.avatar) {
        await bot.sendPhoto(chatId, star.avatar, { caption: `👩 ${star.name}`, parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, '未找到女优头像');
      }
    } catch (err) {
      console.error(`[ERROR] 获取女优头像失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取女优头像出错');
    }
    await bot.answerCallbackQuery(query.id);
  }

  // /stars 分页回调
  if (data.startsWith('stars_page_')) {
    const parts = data.split('_');
    const keyword = decodeURIComponent(parts[2]);
    const page = parseInt(parts[3]);
    await sendStarsPage(chatId, keyword, page, query.id);
  }

  // /stars 影片详情按钮回调
  if (data.startsWith('star_movie_')) {
    const movieId = data.replace('star_movie_', '');
    await sendMovieDetail(chatId, movieId, query.id);
  }
});

// /latest 命令
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求最新影片`);

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies?page=1`);
    const movies = data.movies || [];
    if (!movies.length) {
      await bot.sendMessage(chatId, '未找到最新影片');
      return;
    }

    const latest = movies.slice(0, 15);
    for (const movie of latest) {
      let text = `🎬 <b>${movie.title}</b>\n`;
      text += `编号: <code>${movie.id}</code>\n`;
      text += `日期: ${movie.date || 'N/A'}\n`;
      if (movie.tags?.length) text += `标签: ${movie.tags.join(', ')}\n`;
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error(`[ERROR] 获取最新影片失败: ${err.message}`);
    await bot.sendMessage(chatId, '获取最新影片出错');
  }
});

// /stars 命令（显示按钮列表，点击显示封面 + 详情）
bot.onText(/\/stars (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1].trim();
  await sendStarsPage(chatId, keyword, 1);
});

// 分页函数，显示按钮列表
async function sendStarsPage(chatId, keyword, page, callbackId) {
  try {
    const res = await sendRequest(`${API_BASE_URL}/movies/search?keyword=${encodeURIComponent(keyword)}`);
    const movies = res.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, `没有找到女优「${keyword}」的影片。`);

    const pageSize = 2;
    const start = (page - 1) * pageSize;
    const results = movies.slice(start, start + pageSize);
    if (!results.length) return bot.sendMessage(chatId, '没有更多结果了');

    const keyboard = results.map(movie => ([{
      text: `${movie.title} (${movie.id})`,
      callback_data: `star_movie_${movie.id}`
    }]));

    if (movies.length > start + pageSize) {
      keyboard.push([{ text: '下一页', callback_data: `stars_page_${encodeURIComponent(keyword)}_${page + 1}` }]);
    }

    await bot.sendMessage(chatId, `🔍 搜索女优: ${keyword} (第${page}页)`, {
      reply_markup: { inline_keyboard: keyboard }
    });

    if (callbackId) await bot.answerCallbackQuery(callbackId);
  } catch (err) {
    console.error('[ERROR] 搜索女优失败:', err.message);
    await bot.sendMessage(chatId, `搜索女优「${keyword}」出错`);
  }
}

// 点击按钮显示影片封面 + 详情
async function sendMovieDetail(chatId, movieId, callbackId) {
  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    if (!movie) {
      await bot.sendMessage(chatId, '未找到影片信息');
      return;
    }

    let caption = `🎬 <b>${movie.title}</b>\n编号: <code>${movie.id}</code>\n日期: ${movie.date || 'N/A'}\n`;
    if (movie.tags?.length) caption += `标签: ${movie.tags.join(', ')}\n`;

    await bot.sendPhoto(chatId, movie.img, { caption, parse_mode: 'HTML' });

    // 样品截图按钮
    if (movie.samples?.length > 0) {
      await bot.sendMessage(chatId, '还有更多截图，可使用按钮查看', {
        reply_markup: {
          inline_keyboard: [[{ text: '查看截图', callback_data: `sample_${movieId}_0` }]]
        }
      });
    }

    // 磁力链接按钮（可选）
    // await bot.sendMessage(chatId, '获取磁力链接请使用 /c ' + movieId);

    if (callbackId) await bot.answerCallbackQuery(callbackId);
  } catch (err) {
    console.error('[ERROR] 获取影片详情失败:', err.message);
    await bot.sendMessage(chatId, '获取影片详情失败');
    if (callbackId) await bot.answerCallbackQuery(callbackId);
  }
}

// /help 命令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `可用命令:
  /c [番号] - 查询影片详细信息、磁力链接及样品截图
  /latest - 获取最新的15个影片
  /stars [女优名] - 根据女优名字搜索影片（显示按钮列表，点击显示封面+详情）
  /help - 查看本帮助`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot server running...');
