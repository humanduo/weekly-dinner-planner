import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWeeklyMenu, getWeekStart } from "../src/menuGenerator";
import { sampleRecipes } from "../src/storage";
import { TRENDING_DISHES } from "../src/trending";
import {
  attachSession,
  getRequestUser,
  loginWithPassword,
  logoutRequest,
  registerWithPassword,
  requireAuth,
  type AuthenticatedRequest,
} from "./auth";
import { createAiTrendStore } from "./aiTrends";
import { refreshCreatorTrendReport } from "./creatorTrends";
import { getStorageMode, isDatabaseEnabled, readDbJson, writeDbJson } from "./database";
import type { AiTrendReport, AppState, Recipe, ShoppingCheckedState, WeeklyMenu } from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const dataDir = process.env.DATA_DIR ?? join(rootDir, "data");
const dataFile = join(dataDir, "app-state.json");
const aiTrendFile = join(dataDir, "ai-trends.json");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const APP_STATE_KEY = "app-state";
const AI_TRENDS_KEY = "ai-trends";
const aiTrendStore = createAiTrendStore(
  aiTrendFile,
  isDatabaseEnabled()
    ? {
        read: () => readDbJson<AiTrendReport>(AI_TRENDS_KEY),
        write: (report) => writeDbJson(AI_TRENDS_KEY, report),
      }
    : undefined,
);

const app = express();
app.use(express.json({ limit: "1mb" }));

function userStateKey(userId: string) {
  return `${APP_STATE_KEY}:${userId}`;
}

function userStateFile(userId: string) {
  return join(dataDir, `app-state-${userId}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecipe(value: unknown): value is Recipe {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.ingredients) &&
    Array.isArray(value.steps)
  );
}

function isWeeklyMenu(value: unknown): value is WeeklyMenu {
  return (
    isRecord(value) &&
    typeof value.weekStart === "string" &&
    Array.isArray(value.dailyMenu) &&
    value.dailyMenu.every((day) => isRecord(day) && typeof day.date === "string" && Array.isArray(day.dinner))
  );
}

function isShoppingChecked(value: unknown): value is ShoppingCheckedState {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "boolean");
}

function normalizeState(value: unknown): AppState {
  if (!isRecord(value)) {
    throw new Error("Invalid state payload");
  }

  const recipes = value.recipes;
  const weeklyMenu = value.weeklyMenu;
  const shoppingChecked = value.shoppingChecked;

  if (!Array.isArray(recipes) || !recipes.every(isRecipe) || !isWeeklyMenu(weeklyMenu) || !isShoppingChecked(shoppingChecked)) {
    throw new Error("Invalid state payload");
  }

  return { recipes, weeklyMenu, shoppingChecked };
}

async function createDefaultState(): Promise<AppState> {
  const weekStart = getWeekStart();
  return {
    recipes: sampleRecipes,
    weeklyMenu: generateWeeklyMenu(sampleRecipes, weekStart),
    shoppingChecked: {},
  };
}

async function readFileState(filePath = dataFile): Promise<AppState | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = await readFile(filePath, "utf-8");
  return normalizeState(JSON.parse(raw));
}

async function writeFileState(state: AppState, filePath = dataFile): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function readLegacyState(): Promise<AppState | null> {
  if (isDatabaseEnabled()) {
    const legacy = await readDbJson<unknown>(APP_STATE_KEY);
    if (legacy) {
      return normalizeState(legacy);
    }
  }

  return readFileState();
}

async function readSavedState(userId: string): Promise<AppState | null> {
  if (!isDatabaseEnabled()) {
    const fileState = await readFileState(userStateFile(userId));
    if (fileState) {
      return fileState;
    }

    const legacyState = await readLegacyState();
    if (legacyState) {
      await writeFileState(legacyState, userStateFile(userId));
    }
    return legacyState;
  }

  const saved = await readDbJson<unknown>(userStateKey(userId));
  if (saved) {
    return normalizeState(saved);
  }

  const legacyState = await readLegacyState();
  if (legacyState) {
    await writeDbJson(userStateKey(userId), legacyState);
  }
  return legacyState;
}

async function readState(userId: string): Promise<AppState> {
  const savedState = await readSavedState(userId);
  const state = savedState ?? (await createDefaultState());
  const currentWeekStart = getWeekStart();

  if (!savedState) {
    await writeUserState(userId, state);
  }

  if (state.weeklyMenu.weekStart !== currentWeekStart) {
    const nextState = {
      ...state,
      weeklyMenu: generateWeeklyMenu(state.recipes, currentWeekStart),
      shoppingChecked: {},
    };
    await writeUserState(userId, nextState);
    return nextState;
  }

  return state;
}

async function writeUserState(userId: string, state: AppState): Promise<void> {
  if (isDatabaseEnabled()) {
    await writeDbJson(userStateKey(userId), state);
    return;
  }

  await writeFileState(state, userStateFile(userId));
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "weekly-dinner-planner",
    storage: getStorageMode(),
    time: new Date().toISOString(),
  });
});

app.get("/api/auth/me", async (request, response) => {
  try {
    response.json({ user: await getRequestUser(request) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to read current user" });
  }
});

app.post("/api/auth/register", async (request, response) => {
  try {
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const { user, token } = await registerWithPassword(username, password);
    attachSession(response, token);
    response.status(201).json({ user });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "注册失败" });
  }
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const { user, token } = await loginWithPassword(username, password);
    attachSession(response, token);
    response.json({ user });
  } catch (error) {
    response.status(401).json({ error: error instanceof Error ? error.message : "登录失败" });
  }
});

app.post("/api/auth/logout", async (request, response) => {
  try {
    await logoutRequest(request, response);
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "退出失败" });
  }
});

app.get("/api/state", requireAuth, async (request, response) => {
  try {
    response.json(await readState((request as AuthenticatedRequest).user.id));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to read state" });
  }
});

app.put("/api/state", requireAuth, async (request, response) => {
  try {
    const state = normalizeState(request.body);
    await writeUserState((request as AuthenticatedRequest).user.id, state);
    response.json(state);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid state payload" });
  }
});

app.get("/api/trends", (_request, response) => {
  response.json({ items: TRENDING_DISHES });
});

app.post("/api/creator-trends/refresh", requireAuth, async (request, response) => {
  try {
    response.json(await refreshCreatorTrendReport(request.body?.creators));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to refresh creator trends" });
  }
});

app.get("/api/ai-trends", async (_request, response) => {
  try {
    response.json(await aiTrendStore.getReport());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to load AI trends" });
  }
});

app.post("/api/ai-trends/refresh", async (_request, response) => {
  try {
    response.json(await aiTrendStore.refreshReport(true));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to refresh AI trends" });
  }
});

app.post("/api/ai-trends/ingredient", async (request, response) => {
  try {
    const ingredient = typeof request.body?.ingredient === "string" ? request.body.ingredient.trim() : "";
    if (!ingredient) {
      response.status(400).json({ error: "ingredient is required" });
      return;
    }
    response.json(await aiTrendStore.searchIngredient(ingredient));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to search ingredient trends" });
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_request, response) => {
    response.sendFile(join(distDir, "index.html"));
  });
}

const server = app.listen(port, host, () => {
  aiTrendStore.startScheduler();
  console.log(`Weekly dinner planner is running at http://${host}:${port}`);
});

server.ref();
