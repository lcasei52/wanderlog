"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePlaces, type DayInfo } from "@/context/places-context";
import { useBookings } from "@/context/bookings-context";
import type { Flight, Hotel } from "@/db/schema";
import type { PlaceItem, PlaceListRow } from "@/types/place";
import {
  appendChatMessage,
  clearChatMessages,
  listChatMessages,
} from "@/actions/chat";

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  /** 目的地名，只用于喂给 AI 当上下文 */
  destination?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** 接口协议：Anthropic 走 /v1/messages，其余都按 OpenAI 兼容的 /chat/completions */
type ApiStyle = "openai" | "anthropic";

interface ProviderModel {
  id: string;
  label: string;
}

interface Provider {
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
const PROVIDERS: Provider[] = [
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

const DEFAULT_PROVIDER_ID = "openai";
/** 模型下拉里的「自定义…」，选中后把下拉换成输入框，模型换代时不用改代码 */
const CUSTOM_MODEL = "__custom__";

/** localStorage 键名 */
const LS_PROVIDER = "ai_provider";
const LS_MODEL = "ai_model";
const LS_KEYS = "ai_keys";

/** 各厂商存在同一份 map 里：{ openai: "sk-...", deepseek: "sk-..." }，换厂商不丢 key */
type ApiKeyMap = Record<string, string>;

/**
 * 按协议发一次对话请求，返回助手回复的纯文本。
 * 直接在浏览器里打各家的 API —— key 只存在 localStorage，不经过我们的服务器。
 */
async function callAi(params: {
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
async function describeHttpError(res: Response): Promise<string> {
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

/** 地点压进 prompt 时全程最多列这么多处，超了只报个数，免得行程把 prompt 撑爆 */
const MAX_PLACES_IN_PROMPT = 60;

interface TripContextInput {
  tripName: string;
  destination?: string;
  days: DayInfo[];
  items: PlaceItem[];
  placeLists: PlaceListRow[];
  flights: Flight[];
  hotels: Hotel[];
}

/**
 * 把当前行程压成一段紧凑文本，拼进 system prompt —— 这是 AI 唯一能"看见"行程的途径。
 *
 * 刻意**不** JSON.stringify 原始对象：费 token，而且 dayDate/lng/lat 这类字段名
 * 对模型是噪声，容易让它抓错东西。这里只给"人话"，让模型直接读得懂。
 */
function buildTripContext({
  tripName,
  destination,
  days,
  items,
  placeLists,
  flights,
  hotels,
}: TripContextInput): string {
  const out: string[] = [];

  const span = days.length
    ? `，日期 ${days[0].dayDate} ~ ${days[days.length - 1].dayDate}（共 ${days.length} 天）`
    : "";
  out.push(
    `行程「${tripName}」${span}${destination ? `，目的地：${destination}` : ""}`,
  );

  // 全程共用一个预算，先列的列表先占，后面的天/航班/酒店不受影响（它们本来就不长）
  let budget = MAX_PLACES_IN_PROMPT;
  const joinNames = (list: PlaceItem[]) => {
    if (list.length === 0) return "";
    const take = Math.max(0, Math.min(budget, list.length));
    budget -= take;
    if (take === 0) return `${list.length}处（略）`;
    const shown = list.slice(0, take).map((it) => it.name);
    return take < list.length
      ? `${shown.join("、")} 等${list.length}处`
      : shown.join("、");
  };

  const listLines = placeLists
    .map((l) => {
      const text = joinNames(items.filter((it) => it.listId === l.id));
      return text ? `- ${l.title}：${text}` : null;
    })
    .filter((s): s is string => s !== null);
  if (listLines.length > 0) out.push("地点列表：", ...listLines);

  if (days.length > 0) {
    out.push("每天安排：");
    for (const d of days) {
      const text = joinNames(items.filter((it) => it.dayDate === d.dayDate));
      out.push(`Day ${d.dayNumber}（${d.label}）${text ? `：${text}` : "：还没安排"}`);
    }
  }

  for (const f of flights) {
    out.push(
      `航班：${f.date} ${f.flightNumber} ${f.fromCity} → ${f.toCity} ${f.departureTime}-${f.arrivalTime}`,
    );
  }
  for (const h of hotels) {
    out.push(`住宿：${h.name}（${h.checkIn} 入住 ~ ${h.checkOut} 退房）`);
  }

  return out.join("\n");
}

/**
 * AI 助手侧边栏 —— 从左侧滑入，覆盖 sidebar 和 detail 区域。
 * 自带厂商/模型/API Key 设置，直接浏览器直连各家 API。
 */
export default function AiAssistant({
  isOpen,
  onClose,
  tripId,
  tripName,
  destination,
}: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 行程数据从上下文现取：这两个 Provider 就包在 TripWorkspace 外层
  const { days, items, placeLists } = usePlaces();
  const { flights, hotels } = useBookings();

  // AI 配置
  const [providerId, setProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [model, setModel] = useState(PROVIDERS[0].models[0].id);
  const [apiKeys, setApiKeys] = useState<ApiKeyMap>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const provider =
    PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0];
  const apiKey = apiKeys[provider.id] ?? "";
  const isCustomModel = !provider.models.some((m) => m.id === model);
  const modelLabel =
    provider.models.find((m) => m.id === model)?.label ?? model;

  // 初始化时从 localStorage 读取配置
  useEffect(() => {
    let savedKeys: ApiKeyMap = {};
    try {
      const raw = localStorage.getItem(LS_KEYS);
      if (raw) savedKeys = JSON.parse(raw) as ApiKeyMap;
    } catch {
      // 存的东西坏了就当没配过
    }

    const saved = PROVIDERS.find(
      (p) => p.id === localStorage.getItem(LS_PROVIDER),
    );
    const savedModel = localStorage.getItem(LS_MODEL);

    setApiKeys(savedKeys);
    if (saved) {
      setProviderId(saved.id);
      // 模型可能已经从清单里删掉了，落回该厂商的第一个
      setModel(
        savedModel && saved.models.some((m) => m.id === savedModel)
          ? savedModel
          : saved.models[0].id,
      );
    }
  }, []);

  // 新消息进来滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  // 卸载时掐掉在飞的请求
  useEffect(() => () => abortRef.current?.abort(), []);

  // 行程快照 → prompt 上下文。发送时读，不进渲染路径。
  const tripContext = useMemo(
    () =>
      buildTripContext({
        tripName,
        destination,
        days,
        items,
        placeLists,
        flights,
        hotels,
      }),
    [tripName, destination, days, items, placeLists, flights, hotels],
  );

  // 首次打开面板时把历史对话拉回来。
  // 不在首屏查（见 actions/chat.ts 的说明）——面板点开才用，就点开才拉。
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;

    listChatMessages(tripId)
      .then((rows) => {
        if (cancelled) return;
        const loaded: Message[] = rows.map((r) => ({
          role: r.role === "user" ? "user" : "assistant",
          content: r.content,
        }));
        // 读盘比手快时别把用户刚发出去的话冲掉
        setMessages((prev) => (prev.length === 0 ? loaded : prev));
      })
      .catch((err) => console.error("读取对话记录失败:", err))
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, historyLoaded, tripId]);

  /** 落库用的模型标记："厂商:模型"，比只存模型名好认 */
  const modelTag = `${provider.id}:${model}`;

  /** 存档 fire-and-forget：写库是一趟到 Neon 的往返，绝不能让写库挡住回复 */
  const persist = (role: "user" | "assistant", content: string) => {
    appendChatMessage(
      tripId,
      role,
      content,
      role === "assistant" ? modelTag : null,
    ).catch((err) => console.warn("对话记录入库失败:", err));
  };

  const examplePrompts = [
    `${tripName}的最佳餐厅`,
    `3天${tripName}行程`,
    `${tripName}热门景点`,
  ];

  // 没配好就别发，直接把设置弹出来
  const isConfigured = Boolean(apiKey && model);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!isConfigured) {
      setSettingsOpen(true);
      return;
    }

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);
    persist("user", text);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await callAi({
        provider,
        model,
        apiKey,
        system: `你是旅行规划助手，正在帮用户规划行程「${tripName}」。

下面是这个行程目前的内容，回答时请基于它，不要另编一个行程：
${tripContext}

回答要具体、可执行：涉及地点时给出大致位置和建议停留时长，涉及行程时按天给安排。
用户问"还能加什么"时，先看上面已经排了什么，再给不重复的建议。
拿不准的信息要说明不确定，不要编造营业时间、价格这类会变的事实。
默认用中文回答。`,
        messages: nextMessages,
        signal: controller.signal,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      persist("assistant", reply);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError((err as Error)?.message ?? "请求失败");
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem(LS_PROVIDER, provider.id);
    localStorage.setItem(LS_MODEL, model);
    localStorage.setItem(LS_KEYS, JSON.stringify(apiKeys));
    setSettingsOpen(false);
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    clearChatMessages(tripId).catch((err) =>
      console.warn("清空对话失败:", err),
    );
  };

  return (
    <>
      {/* 遮罩 - 只覆盖左侧 sidebar + detail 区域，不覆盖地图 */}
      {isOpen && (
        <div
          className="fixed top-0 bottom-0 left-0 w-[800px] bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* 侧边栏 */}
      <div
        className={cn(
          "fixed top-0 bottom-0 left-0 w-[800px] bg-white shadow-2xl z-50 transition-transform duration-300 ease-out flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-900">AI 助手</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 设置按钮 */}
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-600 hover:text-gray-900"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>AI 设置</DialogTitle>
                  <DialogDescription>
                    选择厂商和模型，填入对应的 API Key
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* 厂商选择 */}
                  <div className="space-y-2">
                    <Label htmlFor="provider">厂商</Label>
                    <Select
                      value={provider.id}
                      onValueChange={(v) => {
                        const next = PROVIDERS.find((p) => p.id === v);
                        if (!next) return;
                        setProviderId(next.id);
                        // 换厂商后原来的模型 ID 多半不通用，直接落到该厂商第一档
                        setModel(next.models[0].id);
                      }}
                    >
                      <SelectTrigger id="provider">
                        <SelectValue placeholder="选择厂商" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 模型选择 */}
                  <div className="space-y-2">
                    <Label htmlFor="model">模型</Label>
                    <Select
                      value={isCustomModel ? CUSTOM_MODEL : model}
                      onValueChange={(v) => setModel(v === CUSTOM_MODEL ? "" : v)}
                    >
                      <SelectTrigger id="model">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {provider.models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_MODEL}>
                          自定义模型 ID…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustomModel && (
                      <Input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder={`输入模型 ID，例如 ${provider.models[0].id}`}
                        className="font-mono text-sm"
                      />
                    )}
                  </div>

                  {/* API Key */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="apikey">{provider.label} API Key</Label>
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        去申请
                      </a>
                    </div>
                    <Input
                      id="apikey"
                      type="password"
                      value={apiKey}
                      onChange={(e) =>
                        setApiKeys((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))
                      }
                      placeholder={provider.keyHint}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500">
                      密钥只保存在本地浏览器，请求直接发往厂商，不会上传到服务器。
                      每个厂商的 Key 分开存，来回切换不会丢。
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSettingsOpen(false)}
                  >
                    取消
                  </Button>
                  <Button onClick={handleSaveSettings}>保存</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* 清空对话（有记录时才露面） */}
            {messages.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-600 hover:text-red-600"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[420px]">
                  <DialogHeader>
                    <DialogTitle>清空对话？</DialogTitle>
                    <DialogDescription>
                      会删掉这个行程的全部 AI 对话记录，删了拿不回来。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2 pt-2">
                    <DialogClose asChild>
                      <Button variant="outline">取消</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="destructive" onClick={handleClear}>
                        清空
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* 关闭按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* 消息区域 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              {/* 免责声明 */}
              <div className="mb-8 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 max-w-2xl">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm text-gray-600">
                    AI 助手生成的信息可能不完全准确。
                  </p>
                </div>
              </div>

              {/* 示例提示 */}
              <div className="w-full max-w-2xl">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  不知道问什么？试试这些示例：
                </h3>
                <div className="space-y-3">
                  {examplePrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => setInput(prompt)}
                      className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 group"
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-indigo-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span className="text-gray-700 group-hover:text-gray-900">
                          {prompt}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 没配 Key 就直接把人引到设置 */}
              {!isConfigured && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="mt-8 flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-200 bg-indigo-50 text-sm text-indigo-600 hover:bg-indigo-100 transition-colors"
                >
                  <KeyRound className="h-4 w-4" />
                  还没配置 API Key，点这里选择厂商与模型
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "px-4 py-3 rounded-2xl max-w-[70%]",
                      msg.role === "user"
                        ? "bg-indigo-500 text-white"
                        : "bg-gray-100 text-gray-900",
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-gray-100">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`询问旅行相关问题，例如"${tripName}的最佳餐厅？"`}
                className="resize-none border-gray-300 focus-visible:border-indigo-500 min-h-[44px]"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="h-[44px] w-[44px] bg-indigo-500 hover:bg-indigo-600 flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {isConfigured
                ? `当前：${provider.label} · ${modelLabel}`
                : "尚未配置模型，点右上角设置"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
