/**
 * TON Invest Backend Server (Node.js)
 * 
 * ИНСТРУКЦИЯ ПО ЗАПУСКУ НА СВОЕМ СЕРВЕРЕ (VPS, Render, Heroku и т.д.):
 * 1. Установите Node.js
 * 2. Создайте папку, скопируйте этот файл (server.js)
 * 3. Инициализируйте проект: npm init -y
 * 4. Установите зависимости: npm install express telegraf mongoose cors dotenv
 * 5. Создайте файл .env и добавьте туда:
 *    BOT_TOKEN=ваш_токен_бота
 *    MONGO_URI=ваша_ссылка_на_mongodb
 *    PORT=3000
 *    WEBAPP_URL=ссылка_на_этот_миниапп
 * 6. Запустите: node server.js
 */

require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8743293290:AAFgHpNIJ--FD3H1z-nfiBx7IxbQlEPcx60';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://narek:1VPfxLH6NKoxI17E@cluster0.wuftzdl.mongodb.net/?appName=Cluster0';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://invest-sf5k.onrender.com';
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// БАЗА ДАННЫХ (Mongoose Models)
// ==========================================

const UserSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  username: String,
  balance: { type: Number, default: 0 },
  investments: { type: Array, default: [] },
  refEarned: { type: Number, default: 0 },
  refCounts: {
    l1: { type: Number, default: 0 },
    l2: { type: Number, default: 0 },
    l3: { type: Number, default: 0 }
  },
  completedTasks: { type: Array, default: [] },
  isBanned: { type: Boolean, default: false },
  referrer: { type: Number, default: null }, // ID пригласившего
  joined: { type: Date, default: Date.now }
});

const GlobalSchema = new mongoose.Schema({
  id: { type: String, default: 'global' },
  stats: {
    users: { type: Number, default: 0 },
    users24h: { type: Number, default: 0 },
    deposits: { type: Number, default: 0 },
    withdrawals: { type: Number, default: 0 }
  },
  tariffs: { type: Object, default: {} },
  tasks: { type: Array, default: [] }
});

const User = mongoose.model('User', UserSchema);
const Global = mongoose.model('Global', GlobalSchema);

// ==========================================
// TELEGRAM BOT (Обработка /start и Рефералки)
// ==========================================

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username;
  const refId = ctx.startPayload ? parseInt(ctx.startPayload) : null; // ID пригласившего (из ссылки t.me/bot?start=123)

  try {
    let user = await User.findOne({ id: userId });
    let globalData = await Global.findOne({ id: 'global' });
    
    if (!globalData) {
      globalData = new Global({ id: 'global' });
      await globalData.save();
    }

    if (!user) {
      // Новый пользователь
      user = new User({ id: userId, name, username });
      
      // Обработка реферальной системы
      if (refId && refId !== userId) {
        const referrerL1 = await User.findOne({ id: refId });
        if (referrerL1) {
          user.referrer = refId;
          referrerL1.refCounts.l1 += 1;
          await referrerL1.save();

          // Уровень 2
          if (referrerL1.referrer) {
            const referrerL2 = await User.findOne({ id: referrerL1.referrer });
            if (referrerL2) {
              referrerL2.refCounts.l2 += 1;
              await referrerL2.save();

              // Уровень 3
              if (referrerL2.referrer) {
                const referrerL3 = await User.findOne({ id: referrerL2.referrer });
                if (referrerL3) {
                  referrerL3.refCounts.l3 += 1;
                  await referrerL3.save();
                }
              }
            }
          }
        }
      }

      await user.save();
      
      // Обновляем статистику
      globalData.stats.users += 1;
      globalData.stats.users24h += 1;
      await globalData.save();
    }

    // Отправляем кнопку с WebApp
    await ctx.reply(`👋 Добро пожаловать, ${name}!\n\nИнвестируйте TON и получайте пассивный доход каждый день. Нажмите на кнопку ниже, чтобы открыть приложение.`, 
      Markup.inlineKeyboard([
        Markup.button.webApp('💰 Открыть TON Invest', WEBAPP_URL)
      ])
    );

  } catch (err) {
    console.error('Bot start error:', err);
    ctx.reply('Произошла ошибка, попробуйте позже.');
  }
});

bot.launch()\n  .then(() => console.log('🤖 Бот запущен!'))\n  .catch(err => console.error('⚠️ Ошибка соединения с Telegram API (бот не запущен, но сервер продолжит работу):', err.message));

// ==========================================
// EXPRESS API (Для связи с MiniApp)
// ==========================================

require('path');
app.use(express.static(__dirname));

// Главная страница (чтобы не было ошибки "Cannot GET /")
app.get('/', (req, res) => {
  res.send('TON Invest Backend API работает! 🚀');
});



// Получить глобальные данные (статистика, тарифы, таски)
app.get('/api/global', async (req, res) => {
  let global = await Global.findOne({ id: 'global' });
  if(!global) global = await new Global().save();
  const usersList = await User.find({}, 'id name username joined isBanned').sort({ joined: -1 });
  res.json({ ...global.toObject(), usersList });
});

// Регистрация юзера из WebApp (если не был создан ботом)
app.post('/api/users/register', async (req, res) => {
  const { user } = req.body;
  let dbUser = await User.findOne({ id: user.id });
  if (!dbUser) {
    dbUser = new User({ id: user.id, name: user.first_name, username: user.username });
    await dbUser.save();
    await Global.findOneAndUpdate({ id: 'global' }, { $inc: { 'stats.users': 1, 'stats.users24h': 1 } });
  }
  res.json({ success: true });
});

// Получить стейт юзера
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findOne({ id: req.params.id });
  if (user) res.json(user);
  else res.status(404).json({ error: 'User not found' });
});

// Депозит
app.post('/api/transactions/deposit', async (req, res) => {
  const { userId, amount, txHash } = req.body;
  await User.findOneAndUpdate({ id: userId }, { $inc: { balance: amount } });
  await Global.findOneAndUpdate({ id: 'global' }, { $inc: { 'stats.deposits': amount } });
  
  // Здесь можно начислить реферальные бонусы спонсорам от суммы депозита
  const user = await User.findOne({ id: userId });
  if (user && user.referrer) {
    const l1 = await User.findOne({ id: user.referrer });
    if(l1) {
      const bonusL1 = amount * 0.10; // 10%
      await User.findOneAndUpdate({ id: l1.id }, { $inc: { balance: bonusL1, refEarned: bonusL1 } });
      if(l1.referrer) {
        const l2 = await User.findOne({ id: l1.referrer });
        if(l2) {
          const bonusL2 = amount * 0.03; // 3%
          await User.findOneAndUpdate({ id: l2.id }, { $inc: { balance: bonusL2, refEarned: bonusL2 } });
          if(l2.referrer) {
            const bonusL3 = amount * 0.01; // 1%
            await User.findOneAndUpdate({ id: l2.referrer }, { $inc: { balance: bonusL3, refEarned: bonusL3 } });
          }
        }
      }
    }
  }
  res.json({ success: true });
});

// Вывод средств
app.post('/api/transactions/withdraw', async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findOne({ id: userId });
  if(user.balance >= amount) {
    await User.findOneAndUpdate({ id: userId }, { $inc: { balance: -amount } });
    await Global.findOneAndUpdate({ id: 'global' }, { $inc: { 'stats.withdrawals': amount } });
    res.json({ success: true, status: 'pending' });
  } else {
    res.status(400).json({ error: 'Insufficient funds' });
  }
});

// Инвестиция
app.post('/api/investments/create', async (req, res) => {
  const { userId, tariffId, amount } = req.body;
  const user = await User.findOne({ id: userId });
  if(user.balance >= amount) {
    await User.findOneAndUpdate({ id: userId }, { 
      $inc: { balance: -amount },
      $push: { investments: { tariff: tariffId, amount, timestamp: Date.now() } }
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Insufficient funds' });
  }
});

// Выполнение задания
app.post('/api/tasks/complete', async (req, res) => {
  const { userId, taskId } = req.body;
  const global = await Global.findOne({ id: 'global' });
  const task = global.tasks.find(t => t.id === taskId);
  const user = await User.findOne({ id: userId });
  
  if (task && !user.completedTasks.includes(taskId)) {
    // Проверка лимита
    if (task.maxActivations === 0 || task.activations < task.maxActivations) {
      await User.findOneAndUpdate({ id: userId }, {
        $push: { completedTasks: taskId },
        $inc: { balance: task.reward }
      });
      
      await Global.updateOne(
        { id: 'global', "tasks.id": taskId },
        { $inc: { "tasks.$.activations": 1 } }
      );
      return res.json({ success: true });
    }
  }
  res.status(400).json({ success: false });
});

// Админские ручки
app.post('/api/admin/global', async (req, res) => {
  const { adminId, data } = req.body;
  // Здесь должна быть проверка if(adminId === ... )
  await Global.findOneAndUpdate({ id: 'global' }, data, { upsert: true });
  res.json({ success: true });
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { adminId, state } = req.body;
  // Проверка админа
  await User.findOneAndUpdate({ id: req.params.id }, state);
  res.json({ success: true });
});

mongoose.connect(MONGO_URI).then(() => {
  console.log('📦 Подключено к MongoDB');
  app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
}).catch(err => console.error('Ошибка MongoDB:', err));
