/* ========================================
   我是晓松 - API 配置与封装 api.js
   ========================================
   安全提醒：
   以下 API Key 为前端直调方案，打包后 Key 会暴露在 APK 中。
   正式上线前建议改为后端代理或使用 Key 混淆方案。
   ======================================== */

const API_CONFIG = {
  // 智谱 AI（GLM 对话 + CogView 生图）
  zhipu: {
    apiKey: 'a3d19f579fa24125a5263bbe89975a6c.pWvigHXKIKZjHown',
    chatUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    imageUrl: 'https://open.bigmodel.cn/api/paas/v4/images/generations',
    model: 'glm-4-flash',
    imageModel: 'cogview-3-flash',
  },

  // 高德地图（JS API + Web 服务）
  amap: {
    jsKey: '3378d3807ff6589c0bc6d64e5b230a6b',
    securityCode: '3067b24d0317fabd8a429769df429a50',
    webKey: '60a775ed0f7046624967061bfa2c51ab',
    weatherUrl: 'https://restapi.amap.com/v3/weather/weatherInfo',
    geocodeUrl: 'https://restapi.amap.com/v3/geocode/geo',
    regeoUrl: 'https://restapi.amap.com/v3/geocode/regeo',
    poiUrl: 'https://restapi.amap.com/v3/place/text',
    aroundUrl: 'https://restapi.amap.com/v3/place/around',
  },

  // Supabase（用户系统 + 智能体存储）
  // 注册地址：https://supabase.com
  // 创建项目后在 Settings > API 中获取
  supabase: {
    url: 'https://dsjopwthqeuzmjsmuvjh.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzam9wd3RocWV1em1qc211dmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NTUzNDgsImV4cCI6MjEwMzEzMTM0OH0.9hyBlHK4IuHXrmNfzswaOCTcNJk6PEc_6AmBhmuK9c0',
  },
};

/* ========================================
   智谱 AI 对话接口
   策略：先尝试流式，失败则自动降级为非流式
   注意：浏览器中可能遇到 CORS 限制
   HBuilder X 打包后 WebView 不受 CORS 限制，可正常使用
   ======================================== */

const ZhipuAPI = {
  // 超时时间（毫秒）
  TIMEOUT: 60000,

  /**
   * 带超时的 fetch
   */
  _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  },

  /**
   * 发送对话请求（流式优先，失败自动降级为非流式）
   * @param {Array} messages - 消息列表 [{role, content}]
   * @param {Function} onChunk - 流式回调 (chunk, fullText) => void
   * @param {Object} options - { model, temperature }
   * @returns {Promise<string>} 完整回复
   */
  async chat(messages, onChunk, options = {}) {
    try {
      // 先尝试流式
      return await this._chatStream(messages, onChunk, options);
    } catch (streamError) {
      console.warn('[ZhipuAPI] Stream failed, falling back to sync:', streamError.message);
      // 流式失败，降级为非流式
      try {
        const text = await this.chatSync(messages, options);
        if (onChunk) onChunk(text, text);
        return text;
      } catch (syncError) {
        console.error('[ZhipuAPI] Sync also failed:', syncError);
        throw syncError;
      }
    }
  },

  /**
   * 流式对话（内部方法）
   */
  async _chatStream(messages, onChunk, options = {}) {
    const { apiKey, chatUrl, model } = API_CONFIG.zhipu;
    const body = {
      model: options.model || model,
      messages: messages,
      stream: true,
      temperature: options.temperature || 0.7,
    };

    const response = await this._fetchWithTimeout(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    }, this.TIMEOUT);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error('API ' + response.status + (errText ? ': ' + errText.slice(0, 200) : ''));
    }

    if (!response.body) {
      // 没有 body（某些环境不支持 ReadableStream），降级为非流式
      throw new Error('No response body, need sync fallback');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 兼容不同 SSE 格式
        const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content
                         || parsed.choices?.[0]?.message?.content
                         || '';
          if (content) {
            fullText += content;
            if (onChunk) onChunk(content, fullText);
          }
        } catch (e) {
          // 跳过非 JSON 行
        }
      }
    }

    if (!fullText) {
      throw new Error('Empty response from stream');
    }
    return fullText;
  },

  /**
   * 非流式对话（单次返回完整结果）
   */
  async chatSync(messages, options = {}) {
    const { apiKey, chatUrl, model } = API_CONFIG.zhipu;
    const body = {
      model: options.model || model,
      messages: messages,
      stream: false,
      temperature: options.temperature || 0.7,
    };

    const response = await this._fetchWithTimeout(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    }, this.TIMEOUT);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error('API ' + response.status + (errText ? ': ' + errText.slice(0, 200) : ''));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('Empty response: ' + JSON.stringify(data).slice(0, 300));
    }
    return content;
  },

  /**
   * AI 生图（CogView）
   * @param {string} prompt - 图片描述
   * @returns {Promise<string>} 图片 URL
   */
  async generateImage(prompt) {
    const { apiKey, imageUrl, imageModel } = API_CONFIG.zhipu;
    const body = {
      model: imageModel,
      prompt: prompt,
    };

    try {
      const response = await fetch(imageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('API ' + response.status);
      }

      const data = await response.json();
      return data.data?.[0]?.url || '';
    } catch (error) {
      console.error('[ZhipuAPI] generateImage error:', error);
      throw error;
    }
  },
};

/* ========================================
   高德地图/天气接口
   ======================================== */

const AmapAPI = {
  /**
   * 查询天气
   * @param {string} city - 城市名或 adcode
   * @param {string} extensions - 'base'(实况) 或 'all'(预报)
   * @returns {Promise<Object>} 天气数据
   */
  async getWeather(city, extensions = 'all') {
    const { webKey, weatherUrl } = API_CONFIG.amap;
    const url = weatherUrl + '?key=' + webKey + '&city=' + encodeURIComponent(city) + '&extensions=' + extensions;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== '1') {
        throw new Error(data.info || 'weather query failed');
      }
      return data;
    } catch (error) {
      console.error('[AmapAPI] getWeather error:', error);
      throw error;
    }
  },

  /**
   * 地理编码（地址转坐标）
   */
  async geocode(address) {
    const { webKey, geocodeUrl } = API_CONFIG.amap;
    const url = geocodeUrl + '?key=' + webKey + '&address=' + encodeURIComponent(address);

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== '1' || !data.geocodes?.length) {
        throw new Error('geocode failed');
      }
      const loc = data.geocodes[0].location.split(',');
      return { lng: parseFloat(loc[0]), lat: parseFloat(loc[1]), formatted: data.geocodes[0].formatted_address };
    } catch (error) {
      console.error('[AmapAPI] geocode error:', error);
      throw error;
    }
  },

  /**
   * 逆地理编码（坐标转地址）
   */
  async regeo(lng, lat) {
    const { webKey, regeoUrl } = API_CONFIG.amap;
    const url = regeoUrl + '?key=' + webKey + '&location=' + lng + ',' + lat;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== '1') {
        throw new Error('regeo failed');
      }
      return data.regeocode;
    } catch (error) {
      console.error('[AmapAPI] regeo error:', error);
      throw error;
    }
  },

  /**
   * POI 搜索
   */
  async searchPOI(keyword, city = '', page = 1) {
    const { webKey, poiUrl } = API_CONFIG.amap;
    let url = poiUrl + '?key=' + webKey + '&keywords=' + encodeURIComponent(keyword) + '&offset=20&page=' + page;
    if (city) url += '&city=' + encodeURIComponent(city);

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== '1') {
        throw new Error('poi search failed');
      }
      return data.pois || [];
    } catch (error) {
      console.error('[AmapAPI] searchPOI error:', error);
      throw error;
    }
  },

  /**
   * 周边搜索
   */
  async searchAround(lng, lat, keyword, radius = 3000) {
    const { webKey, aroundUrl } = API_CONFIG.amap;
    const url = aroundUrl + '?key=' + webKey + '&location=' + lng + ',' + lat + '&keywords=' + encodeURIComponent(keyword) + '&radius=' + radius;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== '1') {
        throw new Error('around search failed');
      }
      return data.pois || [];
    } catch (error) {
      console.error('[AmapAPI] searchAround error:', error);
      throw error;
    }
  },
};

/* ========================================
   Supabase 接口
   ======================================== */

const SupabaseAPI = {
  client: null,

  /**
   * 初始化 Supabase 客户端
   * 需要在页面加载时调用
   */
  init() {
    const { url, anonKey } = API_CONFIG.supabase;
    if (!url || !anonKey) {
      console.warn('[Supabase] URL 或 anonKey 未配置，用户系统不可用');
      return false;
    }
    // 使用 Supabase JS SDK（需在 HTML 中引入）
    if (typeof supabase !== 'undefined') {
      this.client = supabase.createClient(url, anonKey);
      return true;
    }
    console.warn('[Supabase] SDK 未加载');
    return false;
  },

  /**
   * 检查是否已配置
   */
  isReady() {
    return this.client !== null;
  },

  /**
   * 获取当前登录用户
   */
  async getCurrentUser() {
    if (!this.client) return null;
    const { data: { user } } = await this.client.auth.getUser();
    return user;
  },

  /**
   * 注册（邮箱 + 密码）
   * @param {string} email - 邮箱
   * @param {string} password - 密码
   * @param {string} username - 用户名
   * @returns {Promise<Object>} 注册结果
   */
  async signUp(email, password, username) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { username: username },
      },
    });
    if (error) throw error;
    return data;
  },

  /**
   * 登录（邮箱 + 密码）
   * @param {string} email - 邮箱
   * @param {string} password - 密码
   * @returns {Promise<Object>} 登录结果
   */
  async signIn(email, password) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) throw error;
    return data;
  },

  /**
   * 退出登录
   */
  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  },

  /**
   * 更新用户资料
   */
  async updateProfile(updates) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.updateUser({
      data: updates,
    });
    if (error) throw error;
    return data;
  },

  /**
   * 获取所有智能体（广场展示）
   */
  async getAgents(category = '', limit = 20, offset = 0) {
    if (!this.client) return [];
    let query = this.client.from('agents').select('*').range(offset, offset + limit - 1).order('uses_count', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * 创建智能体
   */
  async createAgent(agentData) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.from('agents').insert(agentData).select().single();
    if (error) throw error;
    return data;
  },

  /**
   * 获取用户创建的智能体
   */
  async getMyAgents(userId) {
    if (!this.client) return [];
    const { data, error } = await this.client.from('agents').select('*').eq('creator_id', userId);
    if (error) throw error;
    return data || [];
  },

  /**
   * 保存对话历史
   */
  async saveChatHistory(userId, agentId, messages) {
    if (!this.client) return;
    const { error } = await this.client.from('chat_history').upsert({
      user_id: userId,
      agent_id: agentId,
      messages: messages,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[Supabase] saveChatHistory error:', error);
  },

  /**
   * 获取对话历史
   */
  async getChatHistory(userId, agentId) {
    if (!this.client) return [];
    const { data, error } = await this.client.from('chat_history')
      .select('messages')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .single();
    if (error) return [];
    return data?.messages || [];
  },
};
