import type { CreatorTrendReport, Ingredient, TrendingDish } from "../src/types";
import { TRENDING_DISHES } from "../src/trending";

const DEFAULT_CREATORS = [
  "老饭骨",
  "美食作家王刚R",
  "曼食慢语",
  "绵羊料理",
  "日食记",
  "小高姐的 Magic Ingredients",
  "滇西小哥",
  "懒饭",
  "Amanda的小厨房",
  "詹姆士的厨房",
  "大师的菜",
  "马壮实Hera",
];
const SEARCH_ENDPOINT = "https://api.bochaai.com/v1/web-search";
const ALLOWED_SOURCE_HOSTS = ["bilibili.com", "xiaohongshu.com", "douyin.com"];

interface SearchResult {
  name?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  datePublished?: string;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `creator-live-${(hash >>> 0).toString(16)}`;
}

function normalizeCreators(creators: unknown) {
  if (!Array.isArray(creators)) {
    return DEFAULT_CREATORS;
  }

  const cleaned = creators
    .map((creator) => cleanText(creator))
    .filter(Boolean)
    .slice(0, 12);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : DEFAULT_CREATORS;
}

function getSource(url: string): TrendingDish["source"] {
  if (url.includes("bilibili.com")) return "B站";
  if (url.includes("xiaohongshu.com")) return "小红书";
  if (url.includes("douyin.com")) return "抖音";
  return "综合";
}

function isAllowedSourceUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_SOURCE_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

function fallbackReport(creators: string[], notes: string): CreatorTrendReport {
  const creatorSet = new Set(creators);
  const preferred = TRENDING_DISHES.filter((dish) => creatorSet.has(dish.creator));
  const items = [...preferred, ...TRENDING_DISHES.filter((dish) => !creatorSet.has(dish.creator))];

  return {
    generatedAt: new Date().toISOString(),
    source: "fallback",
    notes,
    creators,
    items,
  };
}

function extractSearchResults(payload: unknown) {
  const value = payload as {
    data?: { webPages?: { value?: SearchResult[] } };
    webPages?: { value?: SearchResult[] };
  };
  return value.data?.webPages?.value ?? value.webPages?.value ?? [];
}

async function searchCreatorVideos(creator: string, searchApiKey: string) {
  const response = await fetch(SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${searchApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${creator} 做饭 菜谱 site:bilibili.com OR site:xiaohongshu.com OR site:douyin.com`,
      freshness: "oneMonth",
      summary: true,
      count: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`联网搜索服务返回 ${response.status}`);
  }

  return extractSearchResults(await response.json())
    .filter((result) => isAllowedSourceUrl(cleanText(result.url)))
    .map((result) => ({
      creator,
      title: cleanText(result.name),
      url: cleanText(result.url),
      snippet: cleanText(result.summary) || cleanText(result.snippet),
      publishedAt: cleanText(result.datePublished),
    }));
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function normalizeIngredients(value: unknown): Ingredient[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: cleanText((item as { name?: unknown }).name),
      amount: cleanText((item as { amount?: unknown }).amount, "适量"),
    }))
    .filter((item) => item.name);
}

function normalizeTaste(value: unknown): TrendingDish["taste"] {
  const taste = cleanText(value);
  return ["咸", "甜", "辣", "清淡", "鲜", "酸甜"].includes(taste) ? (taste as TrendingDish["taste"]) : "咸";
}

function normalizeDifficulty(value: unknown): TrendingDish["difficulty"] {
  const difficulty = cleanText(value);
  return ["简单", "中等", "困难"].includes(difficulty) ? (difficulty as TrendingDish["difficulty"]) : "简单";
}

async function organizeSearchResults(results: Awaited<ReturnType<typeof searchCreatorVideos>>[], apiKey: string) {
  const flattened = results.flat();
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const prompt = `你是一位晚餐菜谱编辑。下面是刚刚从公开网页搜索得到的创作者视频结果。请只从这些结果中整理适合家庭晚餐的菜品，不要杜撰搜索结果里不存在的视频链接。

每一道菜都要保留一个真实来源链接。优先保留明确是做菜教程的视频；忽略探店、吃播、纯综艺内容。相似菜只保留一条。最多返回 48 道。

搜索结果：
${JSON.stringify(flattened, null, 2)}

只返回 JSON，不要 markdown。结构：
{
  "items": [
    {
      "name": "菜名",
      "creator": "创作者名",
      "creatorNote": "一句话说明这个作者或这道菜适合什么场景",
      "sourceUrl": "必须原样使用搜索结果中的 url",
      "taste": "咸/甜/辣/清淡/鲜/酸甜",
      "difficulty": "简单/中等/困难",
      "cookTime": 20,
      "ingredients": [{"name":"食材","amount":"数量"}],
      "steps": ["简要步骤1","简要步骤2","简要步骤3"],
      "reason": "为什么今晚值得做",
      "tags": ["标签1","标签2"]
    }
  ]
}`;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你只输出合法 JSON，不输出 markdown，不杜撰来源链接。" },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.45,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API 返回 ${response.status}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = JSON.parse(extractJson(payload.choices?.[0]?.message?.content ?? "")) as { items?: unknown[] };
  const sourceUrlSet = new Set(flattened.map((item) => item.url));

  return (parsed.items ?? [])
    .map<TrendingDish | null>((item) => {
      const value = item as Record<string, unknown>;
      const sourceUrl = cleanText(value.sourceUrl);
      const creator = cleanText(value.creator);
      const name = cleanText(value.name);
      if (!name || !creator || !sourceUrlSet.has(sourceUrl)) return null;

      return {
        id: stableId(`${creator}:${name}:${sourceUrl}`),
        name,
        creator,
        creatorNote: cleanText(value.creatorNote, "来自公开搜索结果的创作者做菜灵感。"),
        source: getSource(sourceUrl),
        sourceUrl,
        taste: normalizeTaste(value.taste),
        difficulty: normalizeDifficulty(value.difficulty),
        cookTime: Number(value.cookTime) || 25,
        ingredients: normalizeIngredients(value.ingredients),
        steps: Array.isArray(value.steps) ? value.steps.map((step) => cleanText(step)).filter(Boolean) : [],
        reason: cleanText(value.reason, "来自近期公开搜索结果，适合加入晚餐备选。"),
        tags: Array.isArray(value.tags) ? value.tags.map((tag) => cleanText(tag)).filter(Boolean) : [],
        searchKeyword: `${creator} ${name}`,
      } satisfies TrendingDish;
    })
    .filter((item): item is TrendingDish => Boolean(item));
}

export async function refreshCreatorTrendReport(rawCreators: unknown): Promise<CreatorTrendReport> {
  const creators = normalizeCreators(rawCreators);
  const searchApiKey = process.env.BOCHA_SEARCH_API_KEY?.trim();
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!searchApiKey || !deepSeekApiKey) {
    return fallbackReport(
      creators,
      "当前使用内置备用池。配置 BOCHA_SEARCH_API_KEY 后，会联网搜索公开页面，再由 DeepSeek 整理成创作者晚餐灵感。",
    );
  }

  try {
    const results = await Promise.all(creators.map((creator) => searchCreatorVideos(creator, searchApiKey)));
    const items = await organizeSearchResults(results, deepSeekApiKey);
    if (items.length === 0) {
      return fallbackReport(creators, "本次公开网页搜索没有找到可用做菜视频，已临时显示备用池。");
    }

    return {
      generatedAt: new Date().toISOString(),
      source: "live-search",
      notes: "已联网搜索公开可索引的视频页面，并由 DeepSeek 整理。平台内未公开或未被搜索引擎收录的内容不会出现。",
      creators,
      items,
    };
  } catch (error) {
    return fallbackReport(creators, error instanceof Error ? `${error.message}，已临时显示备用池。` : "联网刷新失败，已临时显示备用池。");
  }
}
