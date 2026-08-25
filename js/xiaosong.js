/* ========================================
   我是晓松 - 晓松调度引擎 xiaosong.js
   对话管理 / 意图识别 / 智能体调度 / 工具路由
   ======================================== */

/* ========================================
   晓松 System Prompt
   ======================================== */

const XIAOSONG_PROMPT = `你是晓松，用户的私人助理。

性格特点：
- 语气像朋友一样自然温暖，偶尔轻松幽默
- 主动提供建议，不只是被动回答
- 回答简洁有重点，不啰嗦
- 用中文交流

你可以帮助用户使用以下工具，当用户需要使用某个工具时，在回复末尾添加路由标记：
- 天气查询：[ROUTE:weather|城市名]
- 地图导航：[ROUTE:map|搜索关键词]
- 科学计算器：[ROUTE:calculator|]
- 备忘录：[ROUTE:memo|预填内容]
- 时钟：[ROUTE:clock|]
- 浏览器搜索：[ROUTE:browser|搜索关键词]

当用户想要AI生成图片时，添加标记：[IMAGE:图片描述]

路由标记不会被用户直接看到，会被前端解析为可点击的卡片。
正常对话不需要添加任何标记，只有在用户明确需要使用工具时才添加。`;

/* ========================================
   晓松对话引擎
   ======================================== */

const Xiaosong = {
  // 当前对话的智能体（null = 晓松默认模式）
  currentAgent: null,

  // 对话历史
  messages: [],

  // 是否正在回复
  isReplying: false,

  // 当前页面上下文（其他页面可设置）
  pageContext: '',

  /**
   * 初始化
   */
  init() {
    // 从本地加载对话历史
    this.messages = Storage.getMessages('xiaosong');
  },

  /**
   * 设置当前智能体
   */
  setAgent(agent) {
    this.currentAgent = agent;
    if (agent) {
      // 加载该智能体的对话历史
      this.messages = Storage.getMessages(agent.id);
      Storage.addRecentAgent(agent.id);
    } else {
      // 切回晓松
      this.messages = Storage.getMessages('xiaosong');
    }
  },

  /**
   * 获取系统提示
   */
  getSystemPrompt() {
    if (this.currentAgent) {
      // 智能体模式：使用智能体的 prompt + 工具能力
      let prompt = this.currentAgent.system_prompt;
      if (this.currentAgent.tools && this.currentAgent.tools.length > 0) {
        prompt += '\n\n你可以使用以下工具，在回复末尾添加路由标记：\n';
        const toolMap = {
          weather: '- 天气查询：[ROUTE:weather|城市名]',
          map: '- 地图导航：[ROUTE:map|搜索关键词]',
          calculator: '- 科学计算器：[ROUTE:calculator|]',
          memo: '- 备忘录：[ROUTE:memo|预填内容]',
          clock: '- 时钟：[ROUTE:clock|]',
          browser: '- 浏览器搜索：[ROUTE:browser|搜索关键词]',
        };
        this.currentAgent.tools.forEach(tool => {
          if (toolMap[tool]) prompt += toolMap[tool] + '\n';
        });
      }
      if (this.currentAgent.tools && this.currentAgent.tools.includes('image')) {
        prompt += '\n当用户想要生成图片时，添加标记：[IMAGE:图片描述]\n';
      }
      return prompt;
    }
    // 晓松默认模式
    let prompt = XIAOSONG_PROMPT;
    if (this.pageContext) {
      prompt += '\n\n当前页面上下文：用户正在' + this.pageContext + '页面，可能需要与此相关的帮助。';
    }
    return prompt;
  },

  /**
   * 发送消息
   * @param {string} text - 用户消息
   * @param {Object} callbacks - { onUserMsg, onChunk, onRouteCard, onImageCard, onComplete, onError }
   */
  async sendMessage(text, callbacks = {}) {
    if (this.isReplying) return;

    // 添加用户消息
    const userMsg = { role: 'user', content: text, time: new Date().toISOString() };
    this.messages.push(userMsg);
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);

    // 构建API消息列表
    const apiMessages = [
      { role: 'system', content: this.getSystemPrompt() },
      ...this.messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    this.isReplying = true;

    // 智能体身份标识
    const agentName = this.currentAgent ? this.currentAgent.name : null;
    if (callbacks.onStart) callbacks.onStart(agentName);

    try {
      let fullText = '';

      await ZhipuAPI.chat(apiMessages, (chunk, full) => {
        fullText = full;
        if (callbacks.onChunk) callbacks.onChunk(chunk, full);
      }, {
        temperature: 0.7,
      });

      // 解析路由标记
      const { cleanText, routes, images } = this._parseRoutes(fullText);

      // 保存助手消息（清理后的文本）
      const assistantMsg = { role: 'assistant', content: cleanText, time: new Date().toISOString() };
      this.messages.push(assistantMsg);

      // 保存到本地
      const saveId = this.currentAgent ? this.currentAgent.id : 'xiaosong';
      Storage.saveMessages(saveId, this.messages);

      // 如果已登录，同步到云端
      if (Storage.isLoggedIn() && SupabaseAPI.isReady()) {
        const user = Storage.getUser();
        SupabaseAPI.saveChatHistory(user.id, saveId, this.messages).catch(() => {});
      }

      // 回调
      if (callbacks.onComplete) {
        callbacks.onComplete(cleanText, agentName, routes, images);
      }

      // 路由卡片
      if (routes.length > 0 && callbacks.onRouteCard) {
        callbacks.onRouteCard(routes);
      }

      // 图片卡片
      if (images.length > 0 && callbacks.onImageCard) {
        for (const imgPrompt of images) {
          callbacks.onImageCard(imgPrompt);
        }
      }
    } catch (error) {
      console.error('[Xiaosong] sendMessage error:', error);
      const errorMsg = '抱歉，我遇到了一点问题，请稍后再试。';
      this.messages.push({ role: 'assistant', content: errorMsg, time: new Date().toISOString() });
      if (callbacks.onError) callbacks.onError(errorMsg);
    } finally {
      this.isReplying = false;
    }
  },

  /**
   * 解析路由标记
   */
  _parseRoutes(text) {
    const routes = [];
    const images = [];
    let cleanText = text;

    // 解析 [ROUTE:tool|params]
    const routeRegex = /\[ROUTE:(\w+)\|([^\]]*)\]/g;
    let match;
    while ((match = routeRegex.exec(text)) !== null) {
      routes.push({
        tool: match[1],
        params: match[2].trim(),
      });
    }
    cleanText = cleanText.replace(routeRegex, '').trim();

    // 解析 [IMAGE:description]
    const imageRegex = /\[IMAGE:([^\]]+)\]/g;
    while ((match = imageRegex.exec(text)) !== null) {
      images.push(match[1].trim());
    }
    cleanText = cleanText.replace(imageRegex, '').trim();

    return { cleanText, routes, images };
  },

  /**
   * 获取路由信息
   */
  getRouteInfo(tool, params) {
    const routeMap = {
      weather: { url: 'weather.html', label: '查看天气详情', param: '?city=' + encodeURIComponent(params) },
      map: { url: 'map.html', label: '打开地图', param: '?q=' + encodeURIComponent(params) },
      calculator: { url: 'calculator.html', label: '打开计算器', param: '' },
      memo: { url: 'memo.html', label: '打开备忘录', param: '?content=' + encodeURIComponent(params) },
      clock: { url: 'clock.html', label: '打开时钟', param: '' },
      browser: { url: 'browser.html', label: '打开浏览器', param: '?q=' + encodeURIComponent(params) },
    };
    return routeMap[tool] || null;
  },

  /**
   * 清空对话历史
   */
  clearHistory() {
    const saveId = this.currentAgent ? this.currentAgent.id : 'xiaosong';
    this.messages = [];
    Storage.clearMessages(saveId);
  },

  /**
   * 获取对话历史
   */
  getHistory() {
    return this.messages;
  },

  /**
   * 切换回晓松默认模式
   */
  resetToXiaosong() {
    this.currentAgent = null;
    this.messages = Storage.getMessages('xiaosong');
  },

  /**
   * AI 生图（通过智谱 CogView）
   */
  async generateImage(prompt, onUrl) {
    try {
      const url = await ZhipuAPI.generateImage(prompt);
      if (url && onUrl) onUrl(url);
      return url;
    } catch (error) {
      console.error('[Xiaosong] generateImage error:', error);
      return null;
    }
  },
};

/* ========================================
   智能体管理
   ======================================== */

const AgentManager = {
  /**
   * 从广场获取智能体列表
   */
  async getAgents(category = '', limit = 20, offset = 0) {
    if (SupabaseAPI.isReady()) {
      return await SupabaseAPI.getAgents(category, limit, offset);
    }
    // 未配置 Supabase 时返回本地示例数据
    return this._getLocalAgents();
  },

  /**
   * 本地示例智能体（Supabase 未配置时用）
   */
  _getLocalAgents() {
    return [
      {
        id: 'local_1',
        name: '翻译官',
        avatar_url: '',
        system_prompt: '你是专业翻译官，精通中文、英文、日文、韩文等多种语言。用户发送任何语言的文本，你都能准确翻译成目标语言。翻译时保持原文语气和风格。',
        tools: [],
        category: '学习',
        description: '专业多语言翻译助手',
        uses_count: 1234,
        likes_count: 56,
      },
      {
        id: 'local_2',
        name: '学习管家',
        avatar_url: '',
        system_prompt: '你是学习规划师，擅长制定学习计划、整理知识点、设计复习策略。你能根据用户的学习目标和时间安排，给出科学合理的学习建议。',
        tools: ['memo'],
        category: '学习',
        description: '帮你制定学习计划和管理知识',
        uses_count: 890,
        likes_count: 34,
      },
      {
        id: 'local_3',
        name: '厨房助手',
        avatar_url: '',
        system_prompt: '你是烹饪专家，了解各种菜系和烹饪技巧。你能根据用户的食材、口味和天气情况，推荐合适的菜谱和烹饪方法。',
        tools: ['weather'],
        category: '生活',
        description: '根据天气推荐饮食和菜谱',
        uses_count: 567,
        likes_count: 28,
      },
      {
        id: 'local_4',
        name: '面试官',
        avatar_url: '',
        system_prompt: '你是一位经验丰富的HR面试官，擅长模拟各种职位的面试场景。你会提出有针对性的面试问题，并对用户的回答给出专业评价和改进建议。',
        tools: [],
        category: '工作',
        description: '模拟真实面试场景，帮你准备面试',
        uses_count: 423,
        likes_count: 45,
      },
      {
        id: 'local_5',
        name: '周报助手',
        avatar_url: '',
        system_prompt: '你是职场写作专家，擅长撰写各类工作文档。用户描述本周工作内容后，你能整理成结构清晰、重点突出的周报。',
        tools: ['memo'],
        category: '工作',
        description: '帮你快速生成工作周报',
        uses_count: 312,
        likes_count: 67,
      },
      {
        id: 'local_6',
        name: '旅行规划师',
        avatar_url: '',
        system_prompt: '你是旅行规划专家，了解全球各地的旅游景点和旅行攻略。你能根据用户的目的地、时间和预算，制定详细的旅行计划，包括景点推荐、路线规划和天气提醒。',
        tools: ['weather', 'map'],
        category: '生活',
        description: '制定详细的旅行计划',
        uses_count: 256,
        likes_count: 89,
      },
    ];
  },

  /**
   * 创建智能体
   */
  async create(agentData) {
    if (SupabaseAPI.isReady()) {
      return await SupabaseAPI.createAgent(agentData);
    }
    // 本地存储
    const agents = Storage.get('local_agents', []);
    const agent = {
      id: 'local_' + Utils.generateId(),
      ...agentData,
      uses_count: 0,
      likes_count: 0,
      created_at: new Date().toISOString(),
    };
    agents.unshift(agent);
    Storage.set('local_agents', agents);
    return agent;
  },

  /**
   * AI 辅助创建智能体
   * @param {string} description - 用户描述
   * @returns {Promise<Object>} 智能体配置
   */
  async aiAssistCreate(description) {
    const prompt = `用户想创建一个AI智能体，描述如下："${description}"
请帮用户生成智能体配置，返回JSON格式：
{
  "name": "智能体名称（2-6字）",
  "system_prompt": "详细的系统提示词，定义智能体的人设、能力和行为规则",
  "tools": ["可用工具：weather/map/calculator/memo/clock/browser，可多选或空数组"],
  "category": "分类：学习/生活/工作/娱乐",
  "description": "一句话描述（10-20字）"
}
只返回JSON，不要其他内容。`;

    try {
      const result = await ZhipuAPI.chatSync([
        { role: 'user', content: prompt },
      ], { temperature: 0.3 });

      // 尝试解析JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse AI response');
    } catch (error) {
      console.error('[AgentManager] aiAssistCreate error:', error);
      throw error;
    }
  },

  /**
   * 获取我创建的智能体
   */
  async getMyAgents() {
    if (SupabaseAPI.isReady()) {
      const user = Storage.getUser();
      if (!user) return [];
      return await SupabaseAPI.getMyAgents(user.id);
    }
    return Storage.get('local_agents', []);
  },

  /**
   * 格式化工具标签
   */
  formatToolTag(tool) {
    const map = {
      weather: '天气',
      map: '地图',
      calculator: '计算',
      memo: '备忘',
      clock: '时钟',
      browser: '浏览器',
      image: '生图',
    };
    return map[tool] || tool;
  },
};
