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

    // 基本信息
    let message = `🎬 <b>${movie.title}</b>\n`;
    message += `编号: <code>${movie.id}</code>\n`;
    message += `日期: ${movie.date || 'N/A'}\n`;
    if (movie.stars && movie.stars.length > 0) {
      message += `演员: ${movie.stars.map(s => s.name).join(' | ')}\n`;
    }
    if (movie.tags && movie.tags.length > 0) {
      message += `标签: ${movie.tags.join(', ')}\n`;
    }

    // 发送基础信息（文字）
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

// 样品截图翻页按钮
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

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

      // 下一页按钮
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
});

// /latest 命令: 获取最新影片前10个
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[INFO] 用户 ${msg.from.username} 请求最新影片`);

  try {
    const data = await sendRequest(`${API_BASE_URL}/movies?page=1`);

    const movies = data.movies || [];
    if (movies.length === 0) {
      await bot.sendMessage(chatId, '未找到最新影片');
      return;
    }

    const latest = movies.slice(0, 10); // 取前10个
    for (const movie of latest) {
      let caption = `🎬 <b>${movie.title}</b>\n`;
      caption += `编号: <code>${movie.id}</code>\n`;
      caption += `日期: ${movie.date || 'N/A'}\n`;
      if (movie.tags && movie.tags.length > 0) {
        caption += `标签: ${movie.tags.join(', ')}\n`;
      }

      if (movie.img) {
        await bot.sendPhoto(chatId, movie.img, { caption, parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, caption, { parse_mode: 'HTML' });
      }
    }
  } catch (err) {
    console.error(`[ERROR] 获取最新影片失败: ${err.message}`);
    await bot.sendMessage(chatId, '获取最新影片出错');
  }
});

// /help 命令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `可用命令:
  /c [番号] - 查询影片详细信息、磁力链接及样品截图
  /latest - 获取最新的10个影片
  /help - 查看本帮助`;
  bot.sendMessage(chatId, helpMessage);
});

console.log('Bot server running...');
