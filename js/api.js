const API_CONFIG = {
  // 智谱 AI（GLM 对话 + CogView 生图）Render代理路径
  zhipu: {
    apiKey: import.meta.env.VITE_ZHIPU_API_KEY,
    chatUrl: '/api/zhipu/chat/completions',
    imageUrl: '/api/zhipu/images/generations',
    model: 'glm-4-flash',
    imageModel: 'cogview-3-flash',
  },

  // 高德地图 Render代理路径
  amap: {
    jsKey: import.meta.env.VITE_AMAP_JS_KEY,
    securityCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
    webKey: import.meta.env.VITE_AMAP_WEB_KEY,
    weatherUrl: '/api/amap/weather/weatherInfo',
    geocodeUrl: '/api/amap/geocode/geo',
    regeoUrl: '/api/amap/geocode/regeo',
    poiUrl: '/api/amap/place/text',
    aroundUrl: '/api/amap/place/around',
  },

  // Supabase 无需代理，保持原地址
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
};

/* ========================================
   智谱 AI 对话接口
   策略：先尝试流式，失败则自动降级为非流式
   Render代理环境下流式SSE完全兼容
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
      return await this._chatStream(messages, onChunk, options);
    } catch (streamError) {
      console.warn('[ZhipuAPI] Stream failed, falling back to sync:', streamError.message);
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
        } catch (e) {}
      }
    }

    if (!fullText) throw new Error('Empty response from stream');
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
    if (!content) throw new Error('Empty response: ' + JSON.stringify(data).slice(0, 300));
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

      if (!response.ok) throw new Error('API ' + response.status);
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
      if (data.status !== '1') throw new Error(data.info || 'weather query failed');
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
      if (data.status !== '1' || !data.geocodes?.length) throw new Error('geocode failed');
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
      if (data.status !== '1') throw new Error('regeo failed');
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
      if (data.status !== '1') throw new Error('poi search failed');
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
      if (data.status !== '1') throw new Error('around search failed');
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

  init() {
    const { url, anonKey } = API_CONFIG.supabase;
    if (!url || !anonKey) {
      console.warn('[Supabase] URL 或 anonKey 未配置，用户系统不可用');
      return false;
    }
    if (typeof supabase !== 'undefined') {
      this.client = supabase.createClient(url, anonKey);
      return true;
    }
    console.warn('[Supabase] SDK 未加载');
    return false;
  },

  isReady() {
    return this.client !== null;
  },

  async getCurrentUser() {
    if (!this.client) return null;
    const { data: { user } } = await this.client.auth.getUser();
    return user;
  },

  async signUp(email, password, username) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  },

  async updateProfile(updates) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.auth.updateUser({ data: updates });
    if (error) throw error;
    return data;
  },

  async getAgents(category = '', limit = 20, offset = 0) {
    if (!this.client) return [];
    let query = this.client.from('agents').select('*').range(offset, offset + limit - 1).order('uses_count', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createAgent(agentData) {
    if (!this.client) throw new Error('Supabase not initialized');
    const { data, error } = await this.client.from('agents').insert(agentData).select().single();
    if (error) throw error;
    return data;
  },

  async getMyAgents(userId) {
    if (!this.client) return [];
    const { data, error } = await this.client.from('agents').select('*').eq('creator_id', userId);
    if (error) throw error;
    return data || [];
  },

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

export default { API_CONFIG, ZhipuAPI, AmapAPI, SupabaseAPI };
