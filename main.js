// Глобальный перехватчик ошибок для отладки
window.addEventListener('error', (e) => {
  console.error("Global Error:", e.message);
  // Не показываем алерт на каждую мелкую ошибку, но пишем в лог
});

// Initialize Telegram WebApp
let tg = window.Telegram?.WebApp;
if (!tg) {
  // Mock for sandbox
  tg = {
    expand: () => {},
    ready: () => {},
    initDataUnsafe: {
      user: { id: 123456789, first_name: 'Демо', username: 'investor' }
    }
  };
}

try {
  if (tg && typeof tg.expand === 'function') {
    tg.expand();
    tg.ready();
  }
} catch (e) {
  console.warn("TG Init warning:", e);
}

const tgUser = tg.initDataUnsafe?.user || { id: 'demo_user', first_name: 'Guest' };
const tgId = tgUser.id;
const BOT_USERNAME = 'InvestCorTonbot'; // Replace with your bot

// ADMIN SETTINGS
const ADMIN_IDS = [7689940325, 5730406030, 8651862317]; 

// TonConnect UI Safe Init
let tonConnectUI = {
  onStatusChange: () => {},
  sendTransaction: async () => { throw new Error('TON Connect not loaded'); }
};

try {
  if (typeof TON_CONNECT_UI !== 'undefined') {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json',
      buttonRootId: 'ton-connect'
    });
    tonConnectUI.uiOptions = { theme: 'DARK' };
  }
} catch (e) {
  console.error("TonConnect init failed:", e);
}

// === GLOBAL STATE (SIMULATED DATABASE) ===
window.globalData = {
  stats: { users: 0, users24h: 0, deposits: 0, withdrawals: 0 },
  tariffs: {
    1: { id: 1, min: 0.1, max: 1500, dailyRate: 0.03, nameKey: 'tariffs.t1_name', name: 'Стартовый', color: 'blue' },
    2: { id: 2, min: 15, max: 500, dailyRate: 0.21, nameKey: 'tariffs.t2_name', name: 'Максимальный', color: 'red' }
  },
  tasks: [],
  usersList: []
};

// App State & API
let appState = {
  balance: 0,
  investments: [],
  refEarned: 0,
  refCounts: { l1: 0, l2: 0, l3: 0 },
  address: null,
  completedTasks: [],
  isBanned: false
};

// --- НАСТРОЙКИ СВЯЗИ С ВАШИМ MONGODB СЕРВЕРОМ ---
const CONFIG = {
  USE_REAL_API: false, 
  API_URL: 'https://invest-sf5k.onrender.com/api' 
};

// Безопасная обертка для хранилища
const safeStorage = {
  async getItem(key) {
    try {
      if (typeof miniappsAI !== 'undefined' && miniappsAI.storage) {
        return await miniappsAI.storage.getItem(key);
      }
      return localStorage.getItem(key);
    } catch(e) {
      console.warn("Storage getItem error:", e);
      return null;
    }
  },
  async setItem(key, val) {
    try {
      if (typeof miniappsAI !== 'undefined' && miniappsAI.storage) {
        await miniappsAI.storage.setItem(key, val);
      } else {
        localStorage.setItem(key, val);
      }
    } catch(e) {
      console.warn("Storage setItem error:", e);
    }
  }
};

const api = {
  async loadGlobalData() {
    if (CONFIG.USE_REAL_API) {
      try {
        const res = await fetch(`${CONFIG.API_URL}/global`);
        if (res.ok) {
          const data = await res.json();
          window.globalData = { ...window.globalData, ...data };
        }
      } catch (e) { console.error("API Error", e); }
    } else {
      const raw = await safeStorage.getItem('toninvest_global_db');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          window.globalData = { ...window.globalData, ...parsed }; // Merge
          if (!window.globalData.usersList) window.globalData.usersList = [];
          if (!window.globalData.tariffs) window.globalData.tariffs = {};
          if (!window.globalData.tasks) window.globalData.tasks = [];
        } catch(e) { console.warn("JSON parse error for global data", e); }
      } else {
        // Mock some users for demo
        window.globalData.stats = { users: 0, users24h: 0, deposits: 0, withdrawals: 0 };
        window.globalData.usersList = [
          { id: 999111222, name: 'Alex', username: 'alex_ton', joined: Date.now() - 86400000, isBanned: false },
          { id: 555444333, name: 'Maria', username: 'maria_crypto', joined: Date.now() - 172800000, isBanned: true }
        ];
        await this.saveGlobalData(); 
      }
    }
  },
  async saveGlobalData() {
    if (CONFIG.USE_REAL_API) {
      try {
        await fetch(`${CONFIG.API_URL}/admin/global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: tgId, data: window.globalData })
        });
      } catch(e) {}
    } else {
      await safeStorage.setItem('toninvest_global_db', JSON.stringify(window.globalData));
    }
  },
  async registerCurrentUser() {
    if (CONFIG.USE_REAL_API) {
      try {
        await fetch(`${CONFIG.API_URL}/users/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: tgUser })
        });
      } catch(e){}
    } else {
      if (!window.globalData.usersList) window.globalData.usersList = [];
      let exists = window.globalData.usersList.find(u => u.id === tgId);
      if (!exists) {
        window.globalData.usersList.unshift({ 
          id: tgId, 
          name: tgUser.first_name, 
          username: tgUser.username, 
          joined: Date.now(),
          isBanned: false
        });
        if(!window.globalData.stats) window.globalData.stats = { users: 0, users24h: 0, deposits: 0, withdrawals: 0 };
        window.globalData.stats.users += 1;
        window.globalData.stats.users24h += 1;
        await this.saveGlobalData();
      }
    }
  },
  async getUser(userId) {
    if (CONFIG.USE_REAL_API) {
      try {
        const res = await fetch(`${CONFIG.API_URL}/users/${userId}`);
        if(res.ok) return await res.json();
      } catch (e) { console.error(e); }
      return { balance: 0, investments: [], refEarned: 0, refCounts: { l1: 0, l2: 0, l3: 0 }, completedTasks: [], isBanned: false };
    } else {
      const raw = await safeStorage.getItem('toninvest_user_' + userId);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch(e) {}
      }
      
      let defBal = 0;
      let isBan = false;
      const uInfo = (window.globalData.usersList || []).find(u => u.id === userId);
      if (uInfo) isBan = !!uInfo.isBanned;
      if (userId === 999111222) defBal = 150.5;

      return { balance: defBal, investments: [], refEarned: 0, refCounts: { l1: 0, l2: 0, l3: 0 }, completedTasks: [], isBanned: isBan };
    }
  },
  async saveDemoState(userId, state) {
    if (CONFIG.USE_REAL_API) {
      try {
        await fetch(`${CONFIG.API_URL}/admin/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: tgId, state: state })
        });
      } catch(e) {}
    } else {
      await safeStorage.setItem('toninvest_user_' + userId, JSON.stringify(state));
    }
  },
  async deposit(userId, walletAddress, amount, txHash) {
    if (CONFIG.USE_REAL_API) {
      const res = await fetch(`${CONFIG.API_URL}/transactions/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, walletAddress, amount, txHash })
      });
      return await res.json();
    } else {
      appState.balance += amount;
      if(!window.globalData.stats) window.globalData.stats = { users: 0, users24h: 0, deposits: 0, withdrawals: 0 };
      window.globalData.stats.deposits += amount;
      await this.saveGlobalData();
      await this.saveDemoState(userId, appState);
      return { success: true };
    }
  },
  async withdraw(userId, walletAddress, amount) {
    if (CONFIG.USE_REAL_API) {
      const res = await fetch(`${CONFIG.API_URL}/transactions/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, walletAddress, amount })
      });
      return await res.json();
    } else {
      appState.balance -= amount;
      if(!window.globalData.stats) window.globalData.stats = { users: 0, users24h: 0, deposits: 0, withdrawals: 0 };
      window.globalData.stats.withdrawals += amount;
      await this.saveGlobalData();
      await this.saveDemoState(userId, appState);
      return { success: true };
    }
  },
  async invest(userId, tariffId, amount) {
    if (CONFIG.USE_REAL_API) {
      const res = await fetch(`${CONFIG.API_URL}/investments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tariffId, amount })
      });
      return await res.json();
    } else {
      appState.balance -= amount;
      if(!appState.investments) appState.investments = [];
      appState.investments.push({ tariff: tariffId, amount: amount, timestamp: Date.now() });
      await this.saveDemoState(userId, appState);
      return { success: true };
    }
  },
  async completeTask(userId, taskId, rewardAmount) {
    if (CONFIG.USE_REAL_API) {
      const res = await fetch(`${CONFIG.API_URL}/tasks/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId })
      });
      return await res.json();
    } else {
      const tasks = window.globalData.tasks || [];
      const tIndex = tasks.findIndex(t => t.id === taskId);
      if (tIndex === -1) return { success: false };

      if (!appState.completedTasks) appState.completedTasks = [];
      if (!appState.completedTasks.includes(taskId)) {
        appState.completedTasks.push(taskId);
        appState.balance += rewardAmount;
        tasks[tIndex].activations = (tasks[tIndex].activations || 0) + 1;
        
        await this.saveGlobalData();
        await this.saveDemoState(userId, appState);
        return { success: true };
      }
      return { success: false };
    }
  }
};

// UI Helpers
window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if(!container) return;
  const toast = document.createElement('div');
  const isError = type === 'error';
  toast.className = `glass-card bg-slate-900/90 backdrop-blur-xl px-5 py-4 rounded-2xl border ${isError ? 'border-red-500/30' : 'border-emerald-500/30'} flex items-center gap-3 shadow-2xl transform transition-all duration-300 translate-y-[-20px] opacity-0`;
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full ${isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center shrink-0">
      <i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-check'}"></i>
    </div>
    <div class="font-bold text-sm text-white">${message}</div>
  `;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });
  
  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Elements
const tgUserInfo = document.getElementById('tg-user-info');
const tgUserName = document.getElementById('tg-user-name');

if (tgUser && tgUserName) {
  tgUserName.textContent = tgUser.username ? '@' + tgUser.username : tgUser.first_name;
  if(tgUserInfo) tgUserInfo.classList.remove('hidden');
}

const bannedView = document.getElementById('banned-view');
const dashboardView = document.getElementById('dashboard-view');
const bottomNav = document.getElementById('bottom-nav');
const userBalanceEl = document.getElementById('user-balance');
const investmentsList = document.getElementById('investments-list');
const activeCountEl = document.getElementById('active-count');
const btnAdmin = document.getElementById('btn-admin');

// Modal Elements
const modalBackdrop = document.getElementById('modal-backdrop');
const modalContent = document.getElementById('modal-content');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalIcon = document.getElementById('modal-icon');
const modalInput = document.getElementById('modal-input');
const modalError = document.getElementById('modal-error');
const modalErrorText = modalError ? modalError.querySelector('span') : null;
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const modalClose = document.getElementById('modal-close');

// Admin Elements
const adminPanel = document.getElementById('admin-panel');
const adminCloseBtn = document.getElementById('admin-close-btn');

let currentModalAction = null;

const getLocalString = (key, fallback) => {
  if (!key) return fallback;
  try {
    if (typeof window !== 'undefined' && window.miniappI18n && typeof window.miniappI18n.t === 'function') {
      const trans = window.miniappI18n.t(key);
      return (trans === key) ? fallback : trans;
    }
  } catch(e) {}
  return fallback;
};

// Boot Sequence
async function boot() {
  await api.loadGlobalData();
  await api.registerCurrentUser();
  
  if (btnAdmin && ADMIN_IDS.includes(tgId)) {
    btnAdmin.classList.remove('hidden');
  }
}

// Check Ban
function checkBanState() {
  if (appState.isBanned) {
    if(bannedView) bannedView.classList.remove('hidden');
    if(dashboardView) dashboardView.classList.add('hidden');
    if(bottomNav) bottomNav.classList.add('translate-y-full');
    stopAccrualInterval();
    return true;
  } else {
    if(bannedView) bannedView.classList.add('hidden');
    if(dashboardView) dashboardView.classList.remove('hidden');
    if(bottomNav) bottomNav.classList.remove('translate-y-full');
    return false;
  }
}

// Wallet Connection
try {
  if (tonConnectUI && tonConnectUI.onStatusChange) {
    tonConnectUI.onStatusChange((wallet) => {
      if (wallet) {
        appState.address = wallet.account.address;
      } else {
        appState.address = null;
      }
    });
  }
} catch(e) {}

// Initialize App automatically
(async function initApp() {
  try {
    await boot();
    await loadData();
    
    if (!checkBanState()) {
      const refLink = `https://t.me/${BOT_USERNAME}?start=${tgId}`;
      const refInput = document.getElementById('ref-link-input');
      if(refInput) refInput.value = refLink;
      
      renderTariffsCards();
      startAccrualInterval();
      renderState();
      
      if(dashboardView) dashboardView.classList.remove('hidden');
      if(bottomNav) bottomNav.classList.remove('translate-y-full');
      
      switchTab('profile');
    }
  } catch (err) {
    console.error("Critical initialization error:", err);
    // Покажем блок ошибки на экране, чтобы понять в чем дело
    const errorHtml = `<div style="position:fixed; top:10%; left:5%; right:5%; background:rgba(220,38,38,0.95); color:white; padding:20px; border-radius:12px; z-index:999999; backdrop-filter:blur(10px); box-shadow:0 10px 25px rgba(0,0,0,0.5);">
      <h3 style="font-weight:bold; font-size:18px; margin-bottom:10px;">Ошибка загрузки приложения</h3>
      <div style="font-family:monospace; font-size:12px; word-break:break-all; max-height:200px; overflow-y:auto;">${err.message}<br><br>${err.stack}</div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', errorHtml);
  }
})();

const tabs = ['invest', 'tasks', 'friends', 'profile'];
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if(appState.isBanned) return;
    const tabId = e.currentTarget.getAttribute('data-tab');
    switchTab(tabId);
  });
});

function switchTab(activeTabId) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === activeTabId) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  tabs.forEach(tab => {
    const el = document.getElementById(`tab-${tab}`);
    if(!el) return;
    if (tab === activeTabId) {
      el.classList.remove('hidden');
      if (typeof anime !== 'undefined') {
        anime({ targets: `#tab-${tab} .anim-item`, translateY: [20, 0], opacity: [0, 1], duration: 600, delay: anime.stagger(100), easing: 'easeOutCubic' });
      } else {
        document.querySelectorAll(`#tab-${tab} .anim-item`).forEach(el => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
      }
      if (tab === 'tasks') renderTasks();
    } else {
      el.classList.add('hidden');
    }
  });
}

async function loadData() {
  const data = await api.getUser(tgId) || {};
  appState.balance = data.balance || 0;
  appState.investments = data.investments || [];
  appState.refEarned = data.refEarned || 0;
  appState.refCounts = data.refCounts || { l1: 0, l2: 0, l3: 0 };
  appState.completedTasks = data.completedTasks || [];
  
  // Sync ban status from global
  const usersList = window.globalData.usersList || [];
  const myGlob = usersList.find(u => u.id === tgId);
  appState.isBanned = myGlob ? !!myGlob.isBanned : !!data.isBanned;
}

function renderState() {
  if(userBalanceEl) userBalanceEl.textContent = (appState.balance || 0).toFixed(4);
  const refEarnedEl = document.getElementById('ref-earned');
  if(refEarnedEl) refEarnedEl.textContent = (appState.refEarned || 0).toFixed(4);
  const refL1 = document.getElementById('ref-l1-count');
  if(refL1) refL1.textContent = appState.refCounts?.l1 || 0;
  const refL2 = document.getElementById('ref-l2-count');
  if(refL2) refL2.textContent = appState.refCounts?.l2 || 0;
  const refL3 = document.getElementById('ref-l3-count');
  if(refL3) refL3.textContent = appState.refCounts?.l3 || 0;
  renderInvestments();
}

function renderTariffsCards() {
  const grid = document.getElementById('tariffs-grid');
  if(!grid) return;
  const tariffsObj = window.globalData.tariffs || {};
  
  grid.innerHTML = Object.values(tariffsObj).map(t => {
    const isT2 = t.id === 2;
    const color = t.color || 'blue';
    const ratePercent = ((t.dailyRate || 0) * 100).toFixed(0);
    const nameStr = getLocalString(t.nameKey, t.name || 'Тариф');
    const descStr = getLocalString(t.descKey, `От ${t.min || 0} до ${t.max || 0} TON`);
    
    return `
      <div class="glass-card rounded-3xl p-6 relative overflow-hidden anim-item group hover:-translate-y-1 transition-transform duration-300 border-${color}-500/20 ${isT2 ? 'border' : ''}">
        <div class="absolute top-0 right-0 w-32 h-32 bg-${color}-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
        ${isT2 ? '<div class="absolute top-0 right-6 bg-gradient-to-b from-red-500 to-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-b-lg uppercase tracking-wider shadow-lg shadow-red-500/30 z-20">HOT</div>' : ''}
        
        <div class="flex justify-between items-start mb-6 relative z-10 ${isT2 ? 'mt-2' : ''}">
          <div>
            <h3 class="font-bold text-xl text-${isT2 ? 'red' : 'white'} mb-1">${nameStr}</h3>
            <p class="text-slate-400 text-sm">${descStr}</p>
          </div>
          <div class="bg-${color}-500/20 border border-${color}-500/30 text-${color}-400 text-sm px-3 py-1 rounded-full font-bold shadow-[0_0_15px_rgba(var(--tw-colors-${color}-500),0.2)]">
            ${ratePercent}% / 24h
          </div>
        </div>
        <div class="space-y-3 mb-6 relative z-10 text-sm text-slate-300">
          <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-slate-400">${getLocalString('tariffs.daily_profit', 'Ежедневная прибыль')}</span>
            <span class="font-medium text-white">${ratePercent}.00%</span>
          </div>
          <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-slate-400">${getLocalString('tariffs.term', 'Срок депозита')}</span>
            <span class="font-medium text-white">${getLocalString('tariffs.unlimited', 'Бессрочно')}</span>
          </div>
        </div>
        <button data-tariff="${t.id}" onclick="openModal('invest', ${t.id})" class="w-full bg-gradient-to-r from-${color}-600 to-${color}-500 hover:from-${color}-500 hover:to-${color}-400 text-white py-3.5 rounded-xl font-bold transition shadow-lg shadow-${color}-500/25 relative z-10 active:scale-95">
          <span>${getLocalString('app.invest_now', 'Инвестировать')}</span>
        </button>
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if(!container) return;
  const tasks = window.globalData.tasks || [];
  
  if(tasks.length === 0) {
    container.innerHTML = `<div class="text-center p-6 text-slate-500">Нет доступных заданий</div>`;
    return;
  }

  container.innerHTML = tasks.map(task => {
    const isDone = (appState.completedTasks || []).includes(task.id);
    const rewardStr = `+${task.reward} TON`;
    const nameStr = getLocalString(task.nameKey, task.name);
    const descStr = getLocalString(task.descKey, task.desc);
    const limitReached = task.maxActivations > 0 && (task.activations || 0) >= task.maxActivations;
    
    let btnHtml = '';
    if (isDone) {
      btnHtml = `<button disabled class="bg-white/5 text-slate-500 py-2 px-4 rounded-xl font-bold text-sm border border-white/5 cursor-not-allowed w-[110px]">${getLocalString('tasks.done', 'Выполнено')}</button>`;
    } else if (limitReached) {
      btnHtml = `<button disabled class="bg-white/5 text-slate-600 py-2 px-4 rounded-xl font-bold text-xs border border-white/5 cursor-not-allowed w-[110px]">${getLocalString('tasks.limit_reached', 'Лимит')}</button>`;
    } else {
      const btnText = task.link ? getLocalString('tasks.open_link', 'Выполнить') : getLocalString('tasks.claim', 'Забрать');
      btnHtml = `<button onclick="handleTaskClick(event, '${task.id}')" class="bg-gradient-to-r from-${task.color || 'amber'}-600 to-${task.color || 'amber'}-500 hover:from-${task.color || 'amber'}-500 hover:to-${task.color || 'amber'}-400 text-white py-2 px-4 rounded-xl font-bold text-sm shadow-lg shadow-${task.color || 'amber'}-500/20 active:scale-95 transition-all w-[110px]">${btnText}</button>`;
    }

    const iconStr = task.icon || 'fa-bolt';
    return `
      <div class="glass-card p-4 rounded-2xl border ${isDone || limitReached ? 'border-white/5 opacity-70' : `border-${task.color || 'amber'}-500/20`} flex items-center gap-4 transition-all">
        <div class="w-12 h-12 shrink-0 rounded-2xl ${isDone || limitReached ? 'bg-white/5 text-slate-500' : `bg-${task.color || 'amber'}-500/10 text-${task.color || 'amber'}-400 border border-${task.color || 'amber'}-500/20`} flex items-center justify-center text-2xl">
          <i class="fa-brands ${iconStr} ${iconStr.startsWith('fa-') && !iconStr.includes('brands') ? 'fa-solid' : ''}"></i>
        </div>
        <div class="flex-1">
          <h4 class="font-bold text-white text-sm mb-0.5">${nameStr}</h4>
          <p class="text-[11px] text-slate-400 leading-tight">${descStr}</p>
          <div class="mt-2 text-xs font-bold ${isDone || limitReached ? 'text-slate-500' : 'text-amber-400'}">${rewardStr} <span class="text-[10px] font-normal text-slate-500 ml-1">${task.maxActivations > 0 ? `(${task.activations || 0}/${task.maxActivations})` : ''}</span></div>
        </div>
        <div>${btnHtml}</div>
      </div>
    `;
  }).join('');
}

window.handleTaskClick = async (event, taskId) => {
  const tasks = window.globalData.tasks || [];
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const btn = event.currentTarget;
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  btn.disabled = true;

  if (task.link) window.open(task.link, '_blank');
  
  setTimeout(async () => {
    const res = await api.completeTask(tgId, taskId, task.reward);
    if(res.success) {
      renderTasks();
      renderState();
      showToast(`Награда ${task.reward} TON получена!`, 'success');
    } else {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }, task.link ? 2000 : 1000); 
};

function renderInvestments() {
  if(!investmentsList) return;
  const invs = appState.investments || [];
  if(activeCountEl) activeCountEl.textContent = invs.length;
  if (invs.length === 0) {
    investmentsList.innerHTML = `
      <div class="glass-card p-6 rounded-2xl text-center border border-white/5">
        <i class="fa-solid fa-piggy-bank text-3xl text-slate-600 mb-3"></i>
        <p class="text-slate-400 text-sm">${getLocalString('app.no_investments', 'У вас нет инвестиций')}</p>
      </div>`;
    return;
  }

  const now = Date.now();
  const tariffsObj = window.globalData.tariffs || {};
  
  investmentsList.innerHTML = invs.map(inv => {
    const elapsedMs = now - (inv.timestamp || now);
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    const tariff = tariffsObj[inv.tariff];
    if(!tariff) return '';
    
    const earned = (inv.amount || 0) * (tariff.dailyRate || 0) * elapsedDays;
    const colorClass = tariff.color || 'blue';
    const nameStr = getLocalString(tariff.nameKey, tariff.name);
    
    return `
      <div class="glass-card border border-${colorClass}-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-${colorClass}-500/40 transition-colors">
        <div class="absolute -right-10 -bottom-10 w-32 h-32 bg-${colorClass}-500/10 rounded-full blur-2xl group-hover:bg-${colorClass}-500/20 transition-colors"></div>
        <div class="flex justify-between items-center mb-4 relative z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-${colorClass}-500/10 flex items-center justify-center text-${colorClass}-400 font-bold border border-${colorClass}-500/20 shadow-inner">
              T${inv.tariff}
            </div>
            <div>
              <div class="text-sm font-bold text-white leading-tight">${nameStr}</div>
              <div class="text-[10px] text-slate-400 uppercase tracking-wider">${new Date(inv.timestamp || now).toLocaleDateString()}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">${getLocalString('app.invested', 'Инвестировано')}</div>
            <div class="font-bold text-white text-sm">${inv.amount} TON</div>
          </div>
        </div>
        <div class="bg-black/30 rounded-xl p-3 flex justify-between items-center border border-white/5 relative z-10">
          <span class="text-xs text-slate-400 uppercase font-bold tracking-wider">${getLocalString('app.earned', 'Заработано')}</span>
          <span class="text-lg font-black text-emerald-400">+${earned.toFixed(6)} TON</span>
        </div>
      </div>
    `;
  }).join('');
}

let accrualInterval;
function startAccrualInterval() {
  accrualInterval = setInterval(() => {
    if (appState.investments && appState.investments.length > 0) renderInvestments();
  }, 1000);
}
function stopAccrualInterval() { clearInterval(accrualInterval); }

window.openModal = function(action, tariffId = null) {
  if(!modalBackdrop) return;
  currentModalAction = action;
  if(modalInput) modalInput.value = '';
  if(modalError) modalError.classList.add('hidden');
  
  if (action === 'deposit') {
    if(modalIcon) modalIcon.className = 'fa-solid fa-arrow-down';
    if(modalTitle) modalTitle.textContent = getLocalString('modals.deposit_title', 'Пополнить баланс');
    if(modalDesc) modalDesc.textContent = getLocalString('modals.deposit_desc', 'Введите сумму');
  } else if (action === 'withdraw') {
    if(modalIcon) modalIcon.className = 'fa-solid fa-arrow-up';
    if(modalTitle) modalTitle.textContent = getLocalString('modals.withdraw_title', 'Вывод средств');
    if(modalDesc) modalDesc.textContent = getLocalString('modals.withdraw_desc', 'Введите сумму');
  } else if (action === 'invest') {
    currentModalAction = `invest-${tariffId}`;
    if(modalIcon) modalIcon.className = 'fa-solid fa-rocket';
    if(modalTitle) modalTitle.textContent = getLocalString('modals.invest_title', 'Открытие депозита');
    if(modalDesc) modalDesc.textContent = `${getLocalString('modals.invest_desc', 'Инвестиция по тарифу')} ${tariffId}`;
  }
  
  modalBackdrop.classList.remove('hidden');
  setTimeout(() => {
    modalBackdrop.classList.add('opacity-100');
    modalBackdrop.classList.remove('opacity-0');
    if(modalContent) {
      modalContent.classList.add('scale-100');
      modalContent.classList.remove('scale-95');
    }
    if(modalInput) modalInput.focus();
  }, 10);
}

function closeModal() {
  if(!modalBackdrop) return;
  modalBackdrop.classList.add('opacity-0');
  modalBackdrop.classList.remove('opacity-100');
  if(modalContent) {
    modalContent.classList.add('scale-95');
    modalContent.classList.remove('scale-100');
  }
  setTimeout(() => {
    modalBackdrop.classList.add('hidden');
    currentModalAction = null;
  }, 300);
}

if(modalCancel) modalCancel.addEventListener('click', closeModal);
if(modalClose) modalClose.addEventListener('click', closeModal);

if(modalConfirm) modalConfirm.addEventListener('click', async () => {
  const amount = parseFloat(modalInput.value);
  if (isNaN(amount) || amount <= 0) {
    showError(getLocalString('modals.error_min', 'Сумма меньше минимальной'));
    return;
  }

  const origContent = modalConfirm.innerHTML;
  modalConfirm.disabled = true;
  modalConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xl relative z-10"></i>';

  try {
    if (currentModalAction === 'deposit' || currentModalAction === 'withdraw') {
      if (!appState.address) {
        return showError(getLocalString('modals.error_no_wallet', 'Сначала подключите кошелек сверху'));
      }
    }

    if (currentModalAction === 'deposit') {
      try {
        const nanoTon = Math.floor(amount * 1000000000).toString();
        const transaction = {
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages: [{ address: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N", amount: nanoTon }]
        };
        if(!tonConnectUI || !tonConnectUI.sendTransaction) throw new Error("TonConnect not initialized");
        const result = await tonConnectUI.sendTransaction(transaction);
        await api.deposit(tgId, appState.address, amount, result.boc);
        renderState();
        closeModal();
      } catch (e) {
        console.error(e);
        showError(getLocalString('modals.error_tx_failed', 'Ошибка транзакции'));
        return;
      }
    } 
    else if (currentModalAction === 'withdraw') {
      if (amount > appState.balance) {
        showError(getLocalString('modals.error_funds', 'Недостаточно средств'));
        return;
      }
      await api.withdraw(tgId, appState.address, amount);
      showToast(getLocalString('modals.withdraw_success', 'Заявка успешно создана'), 'success');
      renderState();
      closeModal();
    }
    else if (currentModalAction && currentModalAction.startsWith('invest-')) {
      const tariffId = parseInt(currentModalAction.split('-')[1]);
      const tariffsObj = window.globalData.tariffs || {};
      const tariff = tariffsObj[tariffId];
      if(!tariff) return showError('Тариф не найден');
      
      if (amount < tariff.min) return showError(`Мин. сумма: ${tariff.min} TON`);
      if (amount > tariff.max) return showError(`Макс. сумма: ${tariff.max} TON`);
      if (amount > appState.balance) return showError(getLocalString('modals.error_funds', 'Недостаточно средств'));

      await api.invest(tgId, tariffId, amount);
      renderState();
      switchTab('profile');
      closeModal();
      showToast('Депозит успешно открыт!', 'success');
    }
  } finally {
    modalConfirm.disabled = false;
    modalConfirm.innerHTML = origContent;
  }
});

function showError(msg) {
  if(!modalError || !modalErrorText) return;
  modalErrorText.textContent = msg;
  modalError.classList.remove('hidden');
  if(typeof anime !== 'undefined') {
    anime({ targets: modalError, translateX: [10, -10, 8, -8, 5, -5, 0], duration: 500, easing: 'easeInOutSine' });
  }
}

const btnDep = document.getElementById('btn-deposit');
if(btnDep) btnDep.addEventListener('click', () => openModal('deposit'));
const btnWith = document.getElementById('btn-withdraw');
if(btnWith) btnWith.addEventListener('click', () => openModal('withdraw'));
const btnCopyRef = document.getElementById('btn-copy-ref');
if(btnCopyRef) btnCopyRef.addEventListener('click', () => {
  const input = document.getElementById('ref-link-input');
  if(!input) return;
  input.select(); document.execCommand('copy');
  const btn = document.getElementById('btn-copy-ref');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check text-white"></i>';
  btn.classList.add('bg-emerald-400');
  setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('bg-emerald-400'); }, 2000);
});

// === ADMIN PANEL LOGIC ===
if(btnAdmin) {
  btnAdmin.addEventListener('click', () => {
    if(!adminPanel) return;
    adminPanel.classList.remove('hidden');
    renderAdminPanel();
    setTimeout(() => {
      adminPanel.classList.add('opacity-100', 'translate-y-0');
      adminPanel.classList.remove('opacity-0', 'translate-y-full');
    }, 10);
  });
}

if(adminCloseBtn) {
  adminCloseBtn.addEventListener('click', () => {
    if(!adminPanel) return;
    adminPanel.classList.add('opacity-0', 'translate-y-full');
    adminPanel.classList.remove('opacity-100', 'translate-y-0');
    setTimeout(() => adminPanel.classList.add('hidden'), 400);
  });
}

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget.getAttribute('data-target');
    
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.className = 'admin-tab-btn px-5 py-2.5 rounded-xl font-bold text-sm bg-white/5 text-slate-400 hover:bg-white/10 transition whitespace-nowrap flex items-center gap-2';
    });
    e.currentTarget.className = 'admin-tab-btn active px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/25 transition whitespace-nowrap flex items-center gap-2';

    document.querySelectorAll('.admin-tab-content').forEach(c => {
      c.classList.add('hidden');
      c.classList.remove('animate-fade-in');
    });
    
    const targetEl = document.getElementById(target);
    if(targetEl) {
      targetEl.classList.remove('hidden');
      void targetEl.offsetWidth; 
      targetEl.classList.add('animate-fade-in');
    }
    
    if (target === 'admin-users') {
      renderAdminUsersList();
    }
  });
});

function renderAdminPanel() {
  const stats = window.globalData.stats || { users: 0, users24h: 0, deposits: 0, withdrawals: 0 };
  const uEl = document.getElementById('as-users');
  if(uEl) uEl.textContent = stats.users.toLocaleString();
  const u24El = document.getElementById('as-users-24h');
  if(u24El) u24El.textContent = `+${stats.users24h}`;
  const dEl = document.getElementById('as-deps');
  if(dEl) dEl.textContent = stats.deposits.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  const wEl = document.getElementById('as-withs');
  if(wEl) wEl.textContent = stats.withdrawals.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

  const tl = document.getElementById('admin-tariffs-list');
  const tariffsObj = window.globalData.tariffs || {};
  if(tl) {
    tl.innerHTML = Object.values(tariffsObj).map(t => {
      const nameStr = getLocalString(t.nameKey, t.name);
      return `
        <div class="glass-card p-5 rounded-3xl border border-white/5 flex flex-col gap-5 relative overflow-hidden group">
          <div class="absolute -right-10 -bottom-10 w-32 h-32 bg-${t.color || 'blue'}-500/10 rounded-full blur-3xl group-hover:bg-${t.color || 'blue'}-500/20 transition-colors"></div>
          <div class="flex justify-between items-center relative z-10">
            <div>
              <h4 class="font-bold text-lg text-white mb-1">${nameStr}</h4>
              <p class="text-[11px] text-slate-400 uppercase tracking-wider">Текущая ставка: <span class="text-white font-bold">${((t.dailyRate||0)*100).toFixed(2)}%</span> / 24ч</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-${t.color || 'blue'}-500/20 text-${t.color || 'blue'}-400 flex items-center justify-center font-black border border-${t.color || 'blue'}-500/30 shadow-inner">
              T${t.id}
            </div>
          </div>
          <div class="flex items-center gap-3 relative z-10">
            <div class="relative flex-1 group/input">
              <input type="number" step="0.1" id="ar-${t.id}" value="${(t.dailyRate||0)*100}" class="w-full bg-black/50 border border-white/10 rounded-2xl pl-5 pr-12 py-3.5 text-white text-xl font-black focus:border-${t.color || 'blue'}-500/50 outline-none transition shadow-inner">
              <span class="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold group-focus-within/input:text-${t.color || 'blue'}-400 transition-colors">%</span>
            </div>
            <button onclick="saveAdminTariff(${t.id})" class="bg-${t.color || 'blue'}-500 hover:bg-${t.color || 'blue'}-400 text-white rounded-2xl px-6 py-3.5 font-bold transition shadow-lg shadow-${t.color || 'blue'}-500/25 active:scale-95 flex items-center gap-2">
              <i class="fa-solid fa-floppy-disk"></i> <span class="hidden sm:inline">Сохранить</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  const tk = document.getElementById('admin-tasks-list');
  const tasksArr = window.globalData.tasks || [];
  if(tk) {
    tk.innerHTML = tasksArr.map((t, idx) => {
      const nameStr = getLocalString(t.nameKey, t.name);
      return `
        <div class="glass-card p-5 rounded-3xl border border-white/5 relative group hover:border-white/10 transition-colors overflow-hidden">
          <button onclick="deleteAdminTask(${idx})" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-50 hover:text-white transition-all active:scale-95 z-10 border border-transparent hover:border-red-500/50 shadow-sm">
            <i class="fa-solid fa-trash-can"></i>
          </button>
          <div class="flex items-start gap-4 mb-4 relative z-10 pr-12">
            <div class="w-10 h-10 shrink-0 rounded-xl bg-${t.color || 'amber'}-500/20 text-${t.color || 'amber'}-400 flex items-center justify-center text-lg shadow-inner border border-${t.color || 'amber'}-500/20">
              <i class="fa-solid ${t.icon || 'fa-bolt'}"></i>
            </div>
            <div>
              <h4 class="font-bold text-white text-[15px] leading-tight mb-1">${nameStr}</h4>
              ${t.link ? `<a href="${t.link}" target="_blank" class="text-[11px] text-blue-400 opacity-80 hover:opacity-100 flex items-center gap-1 transition-opacity"><i class="fa-solid fa-link"></i> Ссылка</a>` : ''}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 relative z-10">
            <div class="bg-black/30 rounded-xl p-3 border border-white/5 flex flex-col justify-center">
              <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Награда</span>
              <span class="font-black text-amber-400 text-sm flex items-center gap-1.5"><i class="fa-solid fa-gift"></i> ${t.reward || 0} TON</span>
            </div>
            <div class="bg-black/30 rounded-xl p-3 border border-white/5 flex flex-col justify-center">
              <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Активации</span>
              <span class="font-black text-white text-sm flex items-center gap-1.5"><i class="fa-solid fa-users"></i> ${t.activations || 0} / ${t.maxActivations === 0 ? '∞' : (t.maxActivations||0)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

window.saveAdminTariff = async (id) => {
  const input = document.getElementById(`ar-${id}`);
  if(!input) return;
  const val = parseFloat(input.value);
  if(!isNaN(val) && val > 0) {
    if(!window.globalData.tariffs) window.globalData.tariffs = {};
    if(window.globalData.tariffs[id]) {
      window.globalData.tariffs[id].dailyRate = val / 100;
      await api.saveGlobalData();
      renderTariffsCards();
      renderAdminPanel();
      showToast('Тариф успешно обновлен!', 'success');
    }
  } else {
    showToast('Введите корректный процент', 'error');
  }
};

window.deleteAdminTask = async (idx) => {
  if(confirm('Удалить задание навсегда?')) {
    if(window.globalData.tasks) {
      window.globalData.tasks.splice(idx, 1);
      await api.saveGlobalData();
      renderTasks();
      renderAdminPanel();
      showToast('Задание удалено', 'success');
    }
  }
};

const formTask = document.getElementById('form-create-task');
if(formTask) {
  formTask.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('nt-name').value;
    const desc = document.getElementById('nt-desc').value;
    const reward = parseFloat(document.getElementById('nt-reward').value);
    const limit = parseInt(document.getElementById('nt-limit').value || '0');
    const link = document.getElementById('nt-link').value;

    if(!window.globalData.tasks) window.globalData.tasks = [];
    window.globalData.tasks.push({
      id: 'task_' + Date.now(),
      name: name, desc: desc, reward: reward, maxActivations: limit, activations: 0, link: link, icon: 'fa-bolt', color: 'amber'
    });
    await api.saveGlobalData();
    
    e.target.reset();
    renderTasks();
    renderAdminPanel();
    showToast('Новое задание добавлено!', 'success');
  });
}

// Admin Users Tab Logic
const searchUserInput = document.getElementById('admin-search-user');
if(searchUserInput) {
  searchUserInput.addEventListener('input', renderAdminUsersList);
}

function renderAdminUsersList() {
  const container = document.getElementById('admin-users-list');
  if(!container) return;
  const query = searchUserInput ? searchUserInput.value.toLowerCase() : '';
  
  const filtered = (window.globalData.usersList || []).filter(u => {
    return String(u.id).includes(query) || (u.username && u.username.toLowerCase().includes(query)) || (u.name && u.name.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-slate-500 py-6 text-sm">Пользователи не найдены</div>`;
    return;
  }

  container.innerHTML = filtered.map(u => {
    const isBan = !!u.isBanned;
    return `
      <div onclick="openAdminUserModal('${u.id}')" class="glass-card p-4 rounded-2xl border ${isBan ? 'border-red-500/20 bg-red-900/10 opacity-70' : 'border-white/5 hover:border-white/10 hover:bg-white/5'} flex justify-between items-center cursor-pointer transition-all active:scale-[0.98]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full ${isBan ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center font-bold text-lg shrink-0">
            ${isBan ? '<i class="fa-solid fa-ban text-sm"></i>' : (u.name ? u.name[0].toUpperCase() : '?')}
          </div>
          <div>
            <div class="font-bold text-white text-sm flex items-center gap-2">
              ${u.name} ${u.username ? `<span class="text-slate-500 font-normal">@${u.username}</span>` : ''}
              ${isBan ? `<span class="bg-red-500/20 text-red-400 text-[9px] uppercase px-1.5 py-0.5 rounded">${getLocalString('admin.banned', 'Забанен')}</span>` : ''}
            </div>
            <div class="text-[11px] text-slate-400">ID: ${u.id}</div>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right text-slate-600 text-sm"></i>
      </div>
    `;
  }).join('');
}

window.openAdminUserModal = async (userId) => {
  const usersList = window.globalData.usersList || [];
  const uInfo = usersList.find(u => String(u.id) === String(userId));
  if (!uInfo) return;
  
  const uState = await api.getUser(uInfo.id);
  const m = document.getElementById('admin-user-modal');
  const mc = document.getElementById('admin-user-modal-content');
  if(!m || !mc) return;
  
  m.classList.remove('hidden');
  void m.offsetWidth;
  m.classList.remove('translate-x-full');

  renderAdminUserContent(uInfo, uState, mc);
};

window.closeAdminUserModal = () => {
  const m = document.getElementById('admin-user-modal');
  if(!m) return;
  m.classList.add('translate-x-full');
  setTimeout(() => m.classList.add('hidden'), 300);
};

function renderAdminUserContent(uInfo, uState, container) {
  const totalInv = (uState.investments || []).reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const isBan = !!uInfo.isBanned;
  
  container.innerHTML = `
    <!-- Header Card -->
    <div class="glass-card p-6 rounded-3xl border ${isBan ? 'border-red-500/30 bg-red-950/20' : 'border-white/5'} flex flex-col items-center text-center relative overflow-hidden mb-4">
      ${isBan ? '<div class="absolute inset-0 bg-red-500/5 z-0 pointer-events-none"></div>' : ''}
      <div class="w-20 h-20 rounded-full ${isBan ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'} flex items-center justify-center font-bold text-3xl mb-3 border-2 relative z-10 shadow-lg">
        ${isBan ? '<i class="fa-solid fa-ban"></i>' : (uInfo.name ? uInfo.name[0].toUpperCase() : '?')}
      </div>
      <h3 class="text-2xl font-bold text-white mb-1 relative z-10">${uInfo.name}</h3>
      <p class="text-slate-400 text-sm mb-3 relative z-10">${uInfo.username ? '@'+uInfo.username : 'Нет юзернейма'} • ID: ${uInfo.id}</p>
      
      <div class="flex gap-2 w-full relative z-10">
        <button onclick="toggleAdminUserBan('${uInfo.id}')" class="flex-1 py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${isBan ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'}">
          <i class="fa-solid ${isBan ? 'fa-unlock' : 'fa-ban'}"></i> 
          <span>${isBan ? getLocalString('admin.unban_user', 'Разблокировать') : getLocalString('admin.ban_user', 'Заблокировать')}</span>
        </button>
      </div>
    </div>

    <!-- Balance Card -->
    <div class="glass-card p-5 rounded-3xl border border-white/5 mb-4">
      <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3" data-i18n="admin.balance">${getLocalString('admin.balance', 'Баланс (TON)')}</label>
      <div class="flex items-center gap-3">
        <input type="number" id="admin-edit-balance" step="0.0001" value="${(uState.balance || 0).toFixed(4)}" class="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-xl font-bold focus:border-blue-500/50 outline-none transition shadow-inner">
        <button onclick="saveAdminUserBalance('${uInfo.id}')" class="bg-blue-600 hover:bg-blue-500 text-white rounded-2xl w-14 h-14 flex items-center justify-center font-bold transition shadow-lg shadow-blue-500/25 shrink-0 active:scale-95">
          <i class="fa-solid fa-floppy-disk text-xl"></i>
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 gap-4">
      <div class="glass-card p-4 rounded-3xl border border-white/5 flex flex-col justify-center">
        <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1" data-i18n="admin.investments">${getLocalString('admin.investments', 'Инвестиции')}</span>
        <div class="text-xl font-black text-white">${totalInv.toFixed(2)} TON</div>
        <div class="text-xs text-blue-400 mt-1">${(uState.investments || []).length} активных</div>
      </div>
      <div class="glass-card p-4 rounded-3xl border border-white/5 flex flex-col justify-center">
        <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1" data-i18n="admin.referrals">${getLocalString('admin.referrals', 'Рефералы (L1)')}</span>
        <div class="text-xl font-black text-white">${uState.refCounts ? uState.refCounts.l1 : 0} чел.</div>
        <div class="text-xs text-emerald-400 mt-1">+${(uState.refEarned || 0).toFixed(2)} TON</div>
      </div>
    </div>
  `;
}

window.saveAdminUserBalance = async (userId) => {
  const input = document.getElementById('admin-edit-balance');
  if(!input) return;
  const newBal = parseFloat(input.value);
  if (isNaN(newBal)) return showToast('Некорректная сумма', 'error');

  const uState = await api.getUser(userId);
  uState.balance = newBal;
  await api.saveDemoState(userId, uState);
  
  if (String(userId) === String(tgId)) {
    appState.balance = newBal;
    renderState();
  }
  showToast('Баланс успешно обновлен', 'success');
};

window.toggleAdminUserBan = async (userId) => {
  const usersList = window.globalData.usersList || [];
  const uInfo = usersList.find(u => String(u.id) === String(userId));
  if (!uInfo) return;
  
  uInfo.isBanned = !uInfo.isBanned;
  await api.saveGlobalData();
  
  const uState = await api.getUser(userId);
  uState.isBanned = uInfo.isBanned;
  await api.saveDemoState(userId, uState);
  
  if (String(userId) === String(tgId)) {
    appState.isBanned = uState.isBanned;
    checkBanState();
  }
  
  showToast(uInfo.isBanned ? 'Пользователь заблокирован' : 'Пользователь разблокирован', uInfo.isBanned ? 'error' : 'success');
  
  const mc = document.getElementById('admin-user-modal-content');
  if(mc) renderAdminUserContent(uInfo, uState, mc);
  renderAdminUsersList();
};
