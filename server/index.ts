import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWeeklyMenu, getWeekStart } from "../src/menuGenerator";
import { sampleRecipes } from "../src/storage";
import { TRENDING_DISHES } from "../src/trending";
import { createAiTrendStore } from "./aiTrends";
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

async function readFileState(): Promise<AppState | null> {
  if (!existsSync(dataFile)) {
    return null;
  }
  const raw = await readFile(dataFile, "utf-8");
  return normalizeState(JSON.parse(raw));
}

async function writeFileState(state: AppState): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function readSavedState(): Promise<AppState | null> {
  if (!isDatabaseEnabled()) {
    return readFileState();
  }

  const saved = await readDbJson<unknown>(APP_STATE_KEY);
  if (saved) {
    return normalizeState(saved);
  }

  const fileState = await readFileState();
  if (fileState) {
    await writeDbJson(APP_STATE_KEY, fileState);
  }
  return fileState;
}

async function readState(): Promise<AppState> {
  const savedState = await readSavedState();
  const state = savedState ?? (await createDefaultState());
  const currentWeekStart = getWeekStart();

  if (!savedState) {
    await writeState(state);
  }

  if (state.weeklyMenu.weekStart !== currentWeekStart) {
    const nextState = {
      ...state,
      weeklyMenu: generateWeeklyMenu(state.recipes, currentWeekStart),
      shoppingChecked: {},
    };
    await writeState(nextState);
    return nextState;
  }

  return state;
}

async function writeState(state: AppState): Promise<void> {
  if (isDatabaseEnabled()) {
    await writeDbJson(APP_STATE_KEY, state);
    return;
  }

  await writeFileState(state);
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "weekly-dinner-planner",
    storage: getStorageMode(),
    time: new Date().toISOString(),
  });
});

app.get("/api/state", async (_request, response) => {
  try {
    response.json(await readState());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to read state" });
  }
});

app.put("/api/state", async (request, response) => {
  try {
    const state = normalizeState(request.body);
    await writeState(state);
    response.json(state);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid state payload" });
  }
});

app.get("/api/trends", (_request, response) => {
  response.json({ items: TRENDING_DISHES });
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
