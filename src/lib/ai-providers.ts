/**
 * 各家大模型的接入配置与调用。
 *
 * 从 AiAssistant.tsx 原样搬过来的 —— 那里原本把厂商清单、协议拼装和错误翻译
 * 全锁在组件文件里，别处想用一次模型（比如给地点生成一段简介）就得复制一份。
 * 这里只放纯逻辑和常量，不碰 React。
 *
 * 安全前提：**key 只存在浏览器 localStorage，请求由浏览器直连厂商**，
 * 不经过我们的服务器（我们的服务端一个 LLM key 都没有）。
 */

/** 接口协议：Anthropic 走 /v1/messages，其余都按 OpenAI 兼容的 /chat/completions */
export type ApiStyle = "openai" | "anthropic";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderModel {
  id: string;
  label: string;
}

export interface Provider {
  id: string;
  label: string;
  /** 接口前缀，具体路径按 api 拼 */
  baseUrl: string;
  api: ApiStyle;
  /** Key 长什么样，只用于输入框 placeholder */
  keyHint: string;
  /** 去哪申请 Key */
  docsUrl: string;
  models: ProviderModel[];
}

/**
 * 各家模型清单（2026-09 核对）。
 * 模型换代很快，过期了直接改这个数组就行 —— 设置里还有「自定义模型 ID」兜底。
 */
export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    api: "openai",
    keyHint: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-6-astra", label: "GPT-6 Astra（旗舰）" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna（便宜）" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com",
    api: "anthropic",
    keyHint: "sk-ant-...",
    docsUrl: "https://platform.claude.com/settings/keys",
    models: [
      { id: "claude-fable-5-1", label: "Claude Fable 5.1（旗舰）" },
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（便宜）" },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    api: "openai",
    keyHint: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash（便宜）" },
    ],
  },
  {
    id: "glm",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai",
    keyHint: "id.secret",
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: [
      { id: "glm-5.2", label: "GLM-5.2（旗舰）" },
      { id: "glm-5.1", label: "GLM-5.1" },
      { id: "glm-5", label: "GLM-5" },
      { id: "glm-5-flash", label: "GLM-5 Flash（免费）" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    api: "openai",
    keyHint: "sk-...",
    docsUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro（旗舰）" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash（便宜）" },
      {
        id: "deepseek-v4-flash-vision-exp",
        label: "DeepSeek V4 Flash Vision（实验·可看图）",
      },
    ],
  },
];

export const DEFAULT_PROVIDER_ID = "openai";
/** 模型下拉里的「自定义…」，选中后把下拉换成输入框，模型换代时不用改代码 */
export const CUSTOM_MODEL = "__custom__";

/** localStorage 键名 */
export const LS_PROVIDER = "ai_provider";
export const LS_MODEL = "ai_model";
export const LS_KEYS = "ai_keys";

/** 各厂商存在同一份 map 里：{ openai: "sk-...", deepseek: "sk-..." }，换厂商不丢 key */
export type ApiKeyMap = Record<string, string>;

/**
 * 按协议发一次对话请求，返回助手回复的纯文本。
 * 直接在浏览器里打各家的 API —— key 只存在 localStorage，不经过我们的服务器。
 */
export async function callAi(params: {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  messages: Message[];
  signal: AbortSignal;
}): Promise<string> {
  const { provider, model, apiKey, system, messages, signal } = params;
  const isAnthropic = provider.api === "anthropic";

  const url = isAnthropic
    ? `${provider.baseUrl}/v1/messages`
    : `${provider.baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  let body: unknown;

  if (isAnthropic) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    // 浏览器直连必须显式声明，否则 Anthropic 会以 CORS 拒掉
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    body = {
      model,
      max_tokens: 2048,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    body = {
      model,
      messages: [{ role: "system", content: system }, ...messages],
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new Error("网络请求失败：可能是网络不通，或该厂商不允许浏览器直连。");
  }

  if (!res.ok) throw new Error(await describeHttpError(res));

  const data = await res.json();
  const content = isAnthropic
    ? ((data?.content ?? []) as { text?: string }[])
        .map((block) => block.text ?? "")
        .join("")
    : ((data?.choices?.[0]?.message?.content as string | undefined) ?? "");

  if (!content.trim()) throw new Error("模型返回了空内容，换个模型或重试试试。");
  return content.trim();
}

/** 把各家的错误报文（形状不完全一样）翻译成一句能看懂的话 */
export async function describeHttpError(res: Response): Promise<string> {
  let detail = "";
  try {
    const data = await res.json();
    const msg = data?.error?.message ?? data?.message ?? data?.error;
    if (typeof msg === "string") detail = msg;
  } catch {
    // 响应不是 JSON，用状态码兜底
  }
  const suffix = detail ? `：${detail}` : "";

  if (res.status === 401 || res.status === 403)
    return `API Key 无效或没有权限（${res.status}）${suffix}`;
  if (res.status === 404)
    return `模型不存在，或你的账号没开通这个模型（404）${suffix}`;
  if (res.status === 429) return `请求太频繁或额度已用完（429）${suffix}`;
  return `接口返回 ${res.status} ${res.statusText}${suffix}`;
}

/**
 * 读「AI 助手」里配好的那套（厂商 + 模型 + 该厂商的 key）。
 * 没配全返回 null —— 调用方拿这个决定"生成"按钮是禁用还是可用。
 * 只在浏览器里调用；服务端拿到的是 null，不会去碰 localStorage。
 */
export function readAiConfig(): {
  provider: Provider;
  model: string;
  apiKey: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    let keys: ApiKeyMap = {};
    const raw = localStorage.getItem(LS_KEYS);
    if (raw) keys = JSON.parse(raw) as ApiKeyMap;

    const provider =
      PROVIDERS.find((p) => p.id === localStorage.getItem(LS_PROVIDER)) ??
      PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID) ??
      PROVIDERS[0];
    const apiKey = keys[provider.id] ?? "";
    if (!apiKey) return null;

    const savedModel = localStorage.getItem(LS_MODEL);
    // 模型可能已经从清单里删掉了，落回该厂商的第一个
    const model =
      savedModel && provider.models.some((m) => m.id === savedModel)
        ? savedModel
        : provider.models[0].id;

    return { provider, model, apiKey };
  } catch {
    // 存的东西坏了就当没配过
    return null;
  }
}
