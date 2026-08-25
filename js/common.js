/* ========================================
   我是晓松 - 公共逻辑 common.js
   Tab导航 / 状态管理 / 本地存储
   ======================================== */

/* ========================================
   底部 Tab SVG 图标
   ======================================== */

const TAB_ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="#86868B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="#86868B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  discover: '<svg viewBox="0 0 24 24" fill="none" stroke="#86868B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="#86868B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

/* ========================================
   Tab 导航管理
   ======================================== */

const TabNav = {
  // Tab 配置
  tabs: [
    { id: 'chat', label: '聊天', icon: TAB_ICONS.chat, url: 'index.html' },
    { id: 'square', label: '广场', icon: TAB_ICONS.square, url: 'square.html' },
    { id: 'discover', label: '发现', icon: TAB_ICONS.discover, url: 'discover.html' },
    { id: 'profile', label: '我的', icon: TAB_ICONS.profile, url: 'profile.html' },
  ],

  /**
   * 渲染底部 Tab 导航到页面
   * @param {string} activeTab - 当前激活的 tab id
   */
  render(activeTab) {
    let existing = document.querySelector('.tab-bar');
    if (existing) existing.remove();

    const tabBar = document.createElement('nav');
    tabBar.className = 'tab-bar';

    // 内部容器 - 居中限宽
    const tabInner = document.createElement('div');
    tabInner.className = 'tab-inner';

    this.tabs.forEach(tab => {
      const item = document.createElement('button');
      item.className = 'tab-item' + (tab.id === activeTab ? ' active' : '');
      item.setAttribute('data-tab', tab.id);

      // 重新生成图标，高亮时改色
      let iconHtml = tab.icon;
      if (tab.id === activeTab) {
        iconHtml = iconHtml.replace(/stroke="#86868B"/g, 'stroke="#007AFF"');
      }

      item.innerHTML =
        '<span class="tab-icon">' + iconHtml + '</span>' +
        '<span class="tab-label">' + tab.label + '</span>';

      item.addEventListener('click', (e) => {
        // 涟漪效果
        this._ripple(e, item);

        // 跳转
        if (tab.id !== activeTab) {
          window.location.href = tab.url;
        }
      });

      tabInner.appendChild(item);
    });

    tabBar.appendChild(tabInner);
    document.body.appendChild(tabBar);
  },

  /**
   * 涟漪效果
   */
  _ripple(e, el) {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  },
};

/* ========================================
   本地存储管理
   ======================================== */

const Storage = {
  PREFIX: 'xws_',  // 我是晓松 缩写

  /**
   * 获取
   */
  get(key, defaultValue = null) {
    const value = localStorage.getItem(this.PREFIX + key);
    if (value === null) return defaultValue;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  /**
   * 设置
   */
  set(key, value) {
    localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
  },

  /**
   * 删除
   */
  remove(key) {
    localStorage.removeItem(this.PREFIX + key);
  },

  /* ---- 业务方法 ---- */

  /**
   * 是否首次启动
   */
  isFirstLaunch() {
    return this.get('launched') !== true;
  },

  /**
   * 标记已启动
   */
  markLaunched() {
    this.set('launched', true);
  },

  /**
   * 获取当前登录状态
   */
  isLoggedIn() {
    return this.get('user') !== null;
  },

  /**
   * 获取当前用户信息
   */
  getUser() {
    return this.get('user');
  },

  /**
   * 保存用户信息
   */
  setUser(user) {
    this.set('user', user);
  },

  /**
   * 清除用户信息
   */
  clearUser() {
    this.remove('user');
  },

  /**
   * 保存对话历史（本地）
   * @param {string} agentId - 智能体ID，晓松用 'xiaosong'
   * @param {Array} messages - 消息列表
   */
  saveMessages(agentId, messages) {
    this.set('chat_' + agentId, messages);
  },

  /**
   * 获取对话历史（本地）
   */
  getMessages(agentId) {
    return this.get('chat_' + agentId, []);
  },

  /**
   * 清空某个智能体的对话历史
   */
  clearMessages(agentId) {
    this.remove('chat_' + agentId);
  },

  /**
   * 获取收藏的智能体列表
   */
  getLikedAgents() {
    return this.get('liked_agents', []);
  },

  /**
   * 切换收藏
   */
  toggleLikeAgent(agentId) {
    const likes = this.getLikedAgents();
    const idx = likes.indexOf(agentId);
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(agentId);
    }
    this.set('liked_agents', likes);
    return idx === -1;  // 返回是否已收藏
  },

  /**
   * 获取最近使用的智能体
   */
  getRecentAgents() {
    return this.get('recent_agents', []);
  },

  /**
   * 添加最近使用的智能体
   */
  addRecentAgent(agentId) {
    let recent = this.getRecentAgents();
    recent = recent.filter(id => id !== agentId);
    recent.unshift(agentId);
    recent = recent.slice(0, 10);
    this.set('recent_agents', recent);
  },
};

/* ========================================
   应用初始化
   ======================================== */

const App = {
  /**
   * 初始化应用（每个页面调用）
   * @param {string} activeTab - 当前页面对应的 Tab
   */
  init(activeTab) {
    // 初始化 Supabase（防御性检查：页面可能未引入 api.js）
    try {
      if (typeof SupabaseAPI !== 'undefined') {
        SupabaseAPI.init();
      }
    } catch (e) {
      console.warn('[App] Supabase init skipped:', e.message);
    }

    // 渲染底部 Tab
    TabNav.render(activeTab);

    // 设置 viewport（移动端适配）
    this._setViewport();
  },

  /**
   * 设置 viewport 适配
   */
  _setViewport() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      const m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      document.head.appendChild(m);
    }
  },

  /**
   * 显示晓松悬浮球（非聊天页面用）
   */
  showXiaosongFloat() {
    const float = document.createElement('div');
    float.className = 'xiaosong-float';
    float.innerHTML = '<img src="assets/xiaosong-avatar.png" alt="晓松">';
    float.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    document.body.appendChild(float);
  },

  /**
   * 返回上一页
   */
  back() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'index.html';
    }
  },
};

/* ========================================
   工具函数
   ======================================== */

const Utils = {
  /**
   * 格式化时间
   */
  formatTime(date) {
    const d = new Date(date);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  },

  /**
   * 相对时间
   */
  timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + '分钟前';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + '小时前';
    const day = Math.floor(hr / 24);
    if (day < 30) return day + '天前';
    return this.formatDate(date);
  },

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 简单的 Markdown 渲染（粗体、换行、代码块）
   */
  renderMarkdown(text) {
    let html = this.escapeHtml(text);
    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.1);padding:8px 12px;border-radius:8px;margin:4px 0;font-size:13px;overflow-x:auto">$1</pre>');
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.1);padding:2px 6px;border-radius:4px;font-size:13px">$1</code>');
    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
  },

  /**
   * 防抖
   */
  debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
};

/* ========================================
   语音播报（Web Speech API）
   ======================================== */

const Speaker = {
  synth: window.speechSynthesis,
  speaking: false,

  /**
   * 语音播报
   * @param {string} text - 要播报的文本
   * @param {Function} onEnd - 播报结束回调
   */
  speak(text, onEnd) {
    if (!this.synth) {
      console.warn('[Speaker] Web Speech API not supported');
      return;
    }

    // 停止当前播报
    this.stop();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1;
    utter.pitch = 1;

    utter.onstart = () => { this.speaking = true; };
    utter.onend = () => {
      this.speaking = false;
      if (onEnd) onEnd();
    };
    utter.onerror = () => {
      this.speaking = false;
      if (onEnd) onEnd();
    };

    this.synth.speak(utter);
  },

  /**
   * 停止播报
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.speaking = false;
    }
  },

  /**
   * 是否正在播报
   */
  isSpeaking() {
    return this.speaking;
  },
};
