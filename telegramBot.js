const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 环境变量检查
if (!process.env.TG_BOT_TOKEN || !process.env.API_BASE_URL || !process.env.TG_ID) {
  console.error('错误: 请设置 TG_BOT_TOKEN、API_BASE_URL 和 TG_ID 环境变量');
  process.exit(1);
}

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
const API_BASE_URL = process.env.API_BASE_URL;

// 临时文件目录
const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR);
}

// 白名单检查函数
function checkPermission(userId) {
  const allowedIds = process.env.TG_ID.split(',').map(id => id.trim());
  return allowedIds.includes(userId.toString());
}

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

// 下载并发送图片（兜底方案）
async function downloadAndSendPhoto(chatId, url, caption = null) {
  try {
    const filename = path.basename(new URL(url).pathname);
    const filePath = path.join(TMP_DIR, filename);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36',
        'Referer': 'https://www.javbus.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    fs.writeFileSync(filePath, response.data);

    if (caption) {
      await bot.sendPhoto(chatId, filePath, { caption, parse_mode: 'HTML' });
    } else {
      await bot.sendPhoto(chatId, filePath);
    }

    // 12小时后删除文件
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, err => {
          if (err) console.error(`[WARN] 删除文件失败: ${filePath}`, err.message);
          else console.log(`[INFO] 已删除临时文件: ${filePath}`);
        });
      }
    }, 12 * 60 * 60 * 1000);

  } catch (err) {
    console.error(`[ERROR] 下载并发送图片失败: ${url}`, err.message);
  }
}

// /c 命令: 查询影片信息
bot.onText(/\/c (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!checkPermission(userId)) {
    bot.sendMessage(chatId, '❌ 你没有权限使用此机器人');
    return;
  }

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
    if (movie.stars?.length) {
      message += `演员: ${movie.stars.map(s => s.name).join(' | ')}\n`;
    }
    if (movie.tags?.length) {
      message += `标签: ${movie.tags.join(', ')}\n`;
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

    // 获取磁力链接
    try {
      const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}?gid=${movie.gid}&uc=${movie.uc}`);
      if (magnets?.length) {
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
    if (movie.samples?.length) {
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

// callback_query 处理
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  if (!checkPermission(userId)) {
    await bot.answerCallbackQuery(query.id, { text: '❌ 你没有权限使用此机器人', show_alert: true });
    return;
  }

  const data = query.data;

  // 样品截图分页
  if (data.startsWith('sample_')) {
    const parts = data.split('_');
    const movieId = parts[1];
    const page = parseInt(parts[2]);

    try {
      const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
      if (!movie.samples?.length) {
        await bot.sendMessage(chatId, '没有可用的截图');
        return;
      }

      const startIndex = page * 5;
      const endIndex = Math.min(startIndex + 5, movie.samples.length);

      const samples = movie.samples.slice(startIndex, endIndex).filter(s => s.src);
      if (!samples.length) {
        await bot.sendMessage(chatId, '没有可用的截图');
        return;
      }

      try {
        const mediaGroup = samples.map(s => ({ type: 'photo', media: s.src }));
        await bot.sendMediaGroup(chatId, mediaGroup);
      } catch (err) {
        console.warn('[WARN] sendMediaGroup 发送失败，尝试逐张发送');
        for (const s of samples) {
          try {
            await bot.sendPhoto(chatId, s.src);
          } catch (e) {
            console.error(`[ERROR] 发送单张截图失败: ${s.src}`, e.message);
            await downloadAndSendPhoto(chatId, s.src);
          }
        }
      }

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
      if (star?.avatar) {
        try {
          await bot.sendPhoto(chatId, star.avatar, { caption: `👩 ${star.name}`, parse_mode: 'HTML' });
        } catch (e) {
          console.error(`[ERROR] 发送女优头像失败: ${star.avatar}`, e.message);
          await downloadAndSendPhoto(chatId, star.avatar, `👩 ${star.name}`);
        }
      } else {
        await bot.sendMessage(chatId, '未找到女优头像');
      }
    } catch (err) {
      console.error(`[ERROR] 获取女优头像失败: ${err.message}`);
      await bot.sendMessage(chatId, '获取女优头像出错');
    }
    await bot.answerCallbackQuery(query.id);
  }

  // /stars 分页
  if (data.startsWith('stars_page_')) {
    const parts = data.split('_');
    const keyword = decodeURIComponent(parts[2]);
    const page = parseInt(parts[3]);
    await sendStarsPage(chatId, keyword, page, query.id);
  }

  // /stars 影片详情
  if (data.startsWith('star_movie_')) {
    const movieId = data.replace('star_movie_', '');
    await sendMovieDetail(chatId, movieId, query.id);
  }
});

// /latest 命令
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!checkPermission(userId)) {
    bot.sendMessage(chatId, '❌ 你没有权限使用此机器人');
    return;
  }

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

// /stars 命令
bot.onText(/\/stars (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!checkPermission(userId)) {
    bot.sendMessage(chatId, '❌ 你没有权限使用此机器人');
    return;
  }

  const keyword = match[1].trim();
  await sendStarsPage(chatId, keyword, 1);
});

// 分页函数
async function sendStarsPage(chatId, keyword, page, callbackId) {
  try {
    const res = await sendRequest(`${API_BASE_URL}/movies/search?keyword=${encodeURIComponent(keyword)}`);
    const movies = res.movies || [];
    if (!movies.length) return bot.sendMessage(chatId, `没有找到女优「${keyword}」的影片。`);

    const pageSize = 20;
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

// 点击按钮显示影片封面 + 详情 + 磁力链接
async function sendMovieDetail(chatId, movieId, callbackId) {
  try {
    const movie = await sendRequest(`${API_BASE_URL}/movies/${movieId}`);
    if (!movie) {
      await bot.sendMessage(chatId, '未找到影片信息');
      return;
    }

    let caption = `🎬 <b>${movie.title}</b>\n编号: <code>${movie.id}</code>\n日期: ${movie.date || 'N/A'}\n`;
    if (movie.tags?.length) caption += `标签: ${movie.tags.join(', ')}\n`;

    if (movie.img) {
      try {
        await bot.sendPhoto(chatId, movie.img, { caption, parse_mode: 'HTML' });
      } catch (e) {
        console.error(`[ERROR] 发送影片封面失败: ${movie.img}`, e.message);
        await downloadAndSendPhoto(chatId, movie.img, caption);
      }
    } else {
      await bot.sendMessage(chatId, caption, { parse_mode: 'HTML' });
    }

    // 样品截图按钮
    if (movie.samples?.length > 0) {
      await bot.sendMessage(chatId, '还有更多截图，可使用按钮查看', {
        reply_markup: {
          inline_keyboard: [[{ text: '查看截图', callback_data: `sample_${movieId}_0` }]]
        }
      });
    }

    // 磁力链接板块
    try {
      const magnets = await sendRequest(`${API_BASE_URL}/magnets/${movieId}?gid=${movie.gid}&uc=${movie.uc}`);
      if (magnets?.length) {
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
  const userId = msg.from.id;
  if (!checkPermission(userId)) {
    bot.sendMessage(chatId, '❌ 你没有权限使用此机器人');
    return;
  }

  const helpMessage = `可用命令:
  /c [番号] - 查询影片详细信息、磁力链接及样品截图
  /latest - 获取最新的15个影片
  /stars [女优名] - 根据女优名字搜索影片（显示按钮列表，点击显示封面+详情+磁力链接）
  /help - 查看本帮助`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot server running...');
