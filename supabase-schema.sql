-- ========================================
-- 我是晓松 - Supabase 数据库建表脚本
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ========================================

-- 1. 用户资料表（profiles）
--    Supabase auth.users 注册成功后，通过 trigger 自动插入一条 profile
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL DEFAULT '晓松用户',
  avatar_url  TEXT DEFAULT '',
  is_vip      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 启用 RLS（行级安全）
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的资料
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 注册时自动创建 profile 的触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', '晓松用户'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. 智能体表（agents）
--    用户在广场创建的 AI 智能体
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_name  TEXT DEFAULT '匿名',
  name          TEXT NOT NULL,
  avatar_url    TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  category      TEXT DEFAULT '其他',
  system_prompt TEXT NOT NULL DEFAULT '',
  tools         TEXT[] DEFAULT '{}',
  is_public     BOOLEAN DEFAULT FALSE,
  likes_count   INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 公开智能体所有人可读；自己的智能体可读写
CREATE POLICY "Public agents are readable" ON agents FOR SELECT USING (is_public = true OR creator_id = auth.uid());
CREATE POLICY "Users can create agents" ON agents FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own agents" ON agents FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own agents" ON agents FOR DELETE USING (auth.uid() = creator_id);

-- 3. 对话历史表（chat_history）
--    登录后同步对话记录到云端
CREATE TABLE IF NOT EXISTS chat_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id   TEXT DEFAULT 'xiaosong',
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  image_url  TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own chat" ON chat_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat" ON chat_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat" ON chat_history FOR DELETE USING (auth.uid() = user_id);

-- 4. 收藏表（favorites）
--    用户收藏的智能体
CREATE TABLE IF NOT EXISTS favorites (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own favorites" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);
