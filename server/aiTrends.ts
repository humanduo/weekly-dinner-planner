import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AiCuisineGroup, AiTrendReport } from "../src/types";

const REFRESH_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

const fallbackGroups: AiCuisineGroup[] = [
  {
    country: "中国",
    cuisine: "中式家常",
    summary: "偏下饭、快手和适合晚餐搭配，适合直接进入一周菜单。",
    dishes: [
      {
        id: "ai-cn-lajiaochaorou",
        name: "辣椒炒肉",
        country: "中国",
        cuisine: "湘味家常",
        heat: 94,
        reason: "短视频和图文平台长期高频出现，卖点是锅气、下饭、食材容易买。",
        ingredients: [
          { name: "五花肉", amount: "250g" },
          { name: "青椒", amount: "4个" },
          { name: "蒜", amount: "3瓣" },
        ],
        tags: ["下饭菜", "家常", "重口味"],
        sourceKeywords: ["辣椒炒肉 家常 下饭", "小红书 辣椒炒肉", "B站 辣椒炒肉 做法"],
      },
      {
        id: "ai-cn-tomato-beef",
        name: "番茄牛腩",
        country: "中国",
        cuisine: "中式炖菜",
        heat: 90,
        reason: "汤汁拌饭友好，适合周末多做，第二天复热也好吃。",
        ingredients: [
          { name: "牛腩", amount: "500g" },
          { name: "番茄", amount: "3个" },
          { name: "土豆", amount: "1个" },
        ],
        tags: ["炖菜", "备餐", "拌饭"],
        sourceKeywords: ["番茄牛腩 家常菜", "B站 番茄牛腩", "小红书 番茄牛腩"],
      },
    ],
  },
  {
    country: "韩国",
    cuisine: "韩式",
    summary: "甜辣、拌饭和锅物热度稳定，适合想换口味但不想太复杂的晚餐。",
    dishes: [
      {
        id: "ai-kr-bibimbap",
        name: "韩式拌饭",
        country: "韩国",
        cuisine: "韩式家常",
        heat: 88,
        reason: "蔬菜、鸡蛋、肉类都能灵活组合，适合清冰箱。",
        ingredients: [
          { name: "米饭", amount: "2碗" },
          { name: "鸡蛋", amount: "2个" },
          { name: "菠菜", amount: "1把" },
          { name: "韩式辣酱", amount: "2勺" },
        ],
        tags: ["拌饭", "清冰箱", "一人食"],
        sourceKeywords: ["韩式拌饭 做法", "小红书 韩式拌饭", "B站 bibimbap 家常"],
      },
      {
        id: "ai-kr-kimchi-stew",
        name: "泡菜豆腐锅",
        country: "韩国",
        cuisine: "韩式锅物",
        heat: 86,
        reason: "酸辣开胃，天冷或不知道吃什么时很容易成餐。",
        ingredients: [
          { name: "泡菜", amount: "200g" },
          { name: "豆腐", amount: "1盒" },
          { name: "五花肉", amount: "150g" },
        ],
        tags: ["锅物", "酸辣", "快手"],
        sourceKeywords: ["泡菜豆腐锅", "韩式泡菜锅 做法", "B站 泡菜锅"],
      },
    ],
  },
  {
    country: "日本",
    cuisine: "日式",
    summary: "偏温和、定食感强，适合想吃清爽但有满足感的晚餐。",
    dishes: [
      {
        id: "ai-jp-oyakodon",
        name: "亲子丼",
        country: "日本",
        cuisine: "日式盖饭",
        heat: 87,
        reason: "鸡肉、鸡蛋、洋葱就能完成，做法稳定，适合工作日。",
        ingredients: [
          { name: "鸡腿肉", amount: "250g" },
          { name: "鸡蛋", amount: "3个" },
          { name: "洋葱", amount: "半个" },
        ],
        tags: ["盖饭", "温和", "快手"],
        sourceKeywords: ["亲子丼 家常", "B站 亲子丼", "小红书 日式盖饭"],
      },
    ],
  },
  {
    country: "意大利",
    cuisine: "意式",
    summary: "面食类对晚餐友好，适合偶尔替换米饭体系。",
    dishes: [
      {
        id: "ai-it-tomato-pasta",
        name: "番茄肉酱意面",
        country: "意大利",
        cuisine: "意式面食",
        heat: 85,
        reason: "家庭版接受度高，适合一锅做两餐。",
        ingredients: [
          { name: "意面", amount: "200g" },
          { name: "牛肉末", amount: "200g" },
          { name: "番茄", amount: "2个" },
        ],
        tags: ["面食", "备餐", "儿童友好"],
        sourceKeywords: ["番茄肉酱意面 家常", "小红书 肉酱意面", "B站 意面 做法"],
      },
    ],
  },
  {
    country: "泰国",
    cuisine: "泰式",
    summary: "酸辣甜鲜明显，适合一周里穿插一次开胃菜。",
    dishes: [
      {
        id: "ai-th-basil-chicken",
        name: "泰式打抛鸡",
        country: "泰国",
        cuisine: "泰式快炒",
        heat: 84,
        reason: "碎肉快炒配米饭很快成餐，口味变化明显。",
        ingredients: [
          { name: "鸡肉末", amount: "250g" },
          { name: "罗勒", amount: "1把" },
          { name: "小米辣", amount: "2个" },
        ],
        tags: ["酸辣", "盖饭", "快炒"],
        sourceKeywords: ["泰式打抛鸡", "小红书 打抛鸡", "B站 泰式盖饭"],
      },
    ],
  },
];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function fallbackReport(notes = "未配置 DEEPSEEK_API_KEY，当前显示本地备用推荐。"): AiTrendReport {
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    nextRefreshAt: addDays(now, 2).toISOString(),
    source: "fallback",
    groups: fallbackGroups,
    notes,
  };
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    return fenced[1];
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

function normalizeReport(value: unknown): AiTrendReport {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { groups?: unknown }).groups)) {
    throw new Error("AI 返回内容格式不正确");
  }

  const now = new Date();
  const report = value as Partial<AiTrendReport>;
  return {
    generatedAt: typeof report.generatedAt === "string" ? report.generatedAt : now.toISOString(),
    nextRefreshAt: typeof report.nextRefreshAt === "string" ? report.nextRefreshAt : addDays(now, 2).toISOString(),
    source: "deepseek-api",
    groups: report.groups ?? [],
    notes: typeof report.notes === "string" ? report.notes : undefined,
  };
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

async function fetchDeepSeekTrendReport(): Promise<AiTrendReport> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return fallbackReport();
  }

  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const now = new Date();
  const prompt = `你是一个中文家常菜趋势编辑。请基于你对小红书、B站、抖音、下厨房等内容平台常见热门晚餐内容的理解，整理适合家庭每周菜单的热门菜品灵感。

重要限制：不要声称已经实时访问或抓取平台热榜；如果没有实时来源，请用“近期内容趋势/常见热门方向”的口径表述。

请按不同国家或地区菜系分组，至少包含：中国、韩国、日本、意大利、泰国，可额外加入墨西哥、越南、印度等。每组 1-3 道菜。

只返回 JSON，不要 markdown。结构必须是：
{
  "generatedAt": "${now.toISOString()}",
  "nextRefreshAt": "${addDays(now, 2).toISOString()}",
  "source": "deepseek-api",
  "notes": "一句中文说明，说明这是 DeepSeek 根据近期热门内容方向整理，不是实时热榜抓取",
  "groups": [
    {
      "country": "中国",
      "cuisine": "中式家常",
      "summary": "一句中文总结",
      "dishes": [
        {
          "id": "stable-kebab-case-id",
          "name": "菜名",
          "country": "中国",
          "cuisine": "中式家常",
          "heat": 1-100,
          "reason": "为什么近期值得推荐，中文一句话",
          "ingredients": [{"name": "食材", "amount": "估算数量"}],
          "tags": ["标签"],
          "sourceKeywords": ["可用于小红书或B站搜索的关键词"]
        }
      ]
    }
  ]
}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "你只输出合法 JSON，不输出 markdown，不输出额外解释。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${detail}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const outputText = payload.choices?.[0]?.message?.content ?? "";
  return normalizeReport(JSON.parse(extractJson(outputText)));
}

async function fetchDeepSeekIngredientReport(ingredient: string): Promise<AiTrendReport> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const normalizedIngredient = ingredient.trim();
  if (!normalizedIngredient) {
    return fallbackReport("请输入一个食材后再搜索。");
  }
  if (!apiKey) {
    return fallbackReport(`未配置 DEEPSEEK_API_KEY，当前无法为「${normalizedIngredient}」生成专项推荐。`);
  }

  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const now = new Date();
  const prompt = `你是一个中文家常菜趋势编辑。用户现在想围绕食材「${normalizedIngredient}」找热门菜品灵感。

请基于你对小红书、B站、抖音、下厨房等内容平台常见热门晚餐内容的理解，整理“包含或适合使用 ${normalizedIngredient} 的热门菜品”。

重要限制：
1. 不要声称已经实时访问或抓取平台热榜。
2. 如果没有实时来源，请使用“近期内容趋势/常见热门方向”的口径。
3. 每一道菜必须明确包含或适合使用「${normalizedIngredient}」。

请按不同国家或地区菜系分组，至少包含 4 个国家/菜系。每组 1-3 道菜。

只返回 JSON，不要 markdown。结构必须是：
{
  "generatedAt": "${now.toISOString()}",
  "nextRefreshAt": "${addDays(now, 2).toISOString()}",
  "source": "deepseek-api",
  "notes": "围绕食材 ${normalizedIngredient} 的一句中文说明",
  "groups": [
    {
      "country": "中国",
      "cuisine": "中式家常",
      "summary": "这个菜系怎么使用 ${normalizedIngredient}",
      "dishes": [
        {
          "id": "stable-kebab-case-id",
          "name": "菜名",
          "country": "中国",
          "cuisine": "中式家常",
          "heat": 1-100,
          "reason": "为什么这道菜适合 ${normalizedIngredient}，中文一句话",
          "ingredients": [{"name": "${normalizedIngredient}", "amount": "估算数量"}],
          "tags": ["标签"],
          "sourceKeywords": ["${normalizedIngredient} 菜名 小红书", "${normalizedIngredient} 菜名 B站"]
        }
      ]
    }
  ]
}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "你只输出合法 JSON，不输出 markdown，不输出额外解释。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${detail}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const outputText = payload.choices?.[0]?.message?.content ?? "";
  return normalizeReport(JSON.parse(extractJson(outputText)));
}

export function createAiTrendStore(filePath: string) {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function getReport(): Promise<AiTrendReport> {
    const saved = await readJson<AiTrendReport>(filePath);
    if (!saved) {
      return refreshReport(false);
    }

    if (new Date(saved.nextRefreshAt).getTime() <= Date.now()) {
      return refreshReport(false);
    }

    return saved;
  }

  async function refreshReport(force = true): Promise<AiTrendReport> {
    try {
      const report = await fetchDeepSeekTrendReport();
      await writeJson(filePath, report);
      return report;
    } catch (error) {
      const saved = await readJson<AiTrendReport>(filePath);
      if (saved && !force) {
        return saved;
      }
      const report = fallbackReport(error instanceof Error ? error.message : "AI 热门推荐刷新失败。");
      await writeJson(filePath, report);
      return report;
    }
  }

  async function searchIngredient(ingredient: string): Promise<AiTrendReport> {
    return fetchDeepSeekIngredientReport(ingredient);
  }

  function startScheduler() {
    refreshTimer?.unref?.();
    refreshTimer = setInterval(() => {
      refreshReport(false).catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  }

  return { getReport, refreshReport, searchIngredient, startScheduler };
}
