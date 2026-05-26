import type { Recipe, ShoppingCheckedState, ShoppingListItem, WeeklyMenu, WeeklyMenuDay } from "./types";

const DISHES_PER_DAY = 3;
const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekStart(date = new Date()): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return formatDate(copy);
}

export function getDayLabel(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00`);
  return DAY_LABELS[date.getDay()] ?? "";
}

function addDays(dateText: string, offset: number): string {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function getDinnerCandidates(recipes: Recipe[]): Recipe[] {
  const dinnerRecipes = recipes.filter((recipe) => recipe.category === "晚餐");
  return dinnerRecipes.length > 0 ? dinnerRecipes : recipes;
}

function weightedRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.flatMap((recipe) => {
    const weight = recipe.favorite ? 3 : 1;
    return Array.from({ length: weight }, () => recipe);
  });
}

function pickRecipes(recipes: Recipe[], usedIds: Set<string>, count = DISHES_PER_DAY): string[] {
  const candidates = getDinnerCandidates(recipes);
  if (candidates.length === 0) {
    return [];
  }

  const picked = new Set<string>();
  const freshPool = shuffle(weightedRecipes(candidates.filter((recipe) => !usedIds.has(recipe.id))));
  const fallbackPool = shuffle(weightedRecipes(candidates));

  for (const recipe of [...freshPool, ...fallbackPool]) {
    if (picked.size >= count) {
      break;
    }
    picked.add(recipe.id);
  }

  return Array.from(picked);
}

export function generateWeeklyMenu(recipes: Recipe[], weekStart = getWeekStart()): WeeklyMenu {
  const usedIds = new Set<string>();
  const dailyMenu: WeeklyMenuDay[] = Array.from({ length: 7 }, (_, index) => {
    const dinner = pickRecipes(recipes, usedIds);
    dinner.forEach((id) => usedIds.add(id));
    return {
      date: addDays(weekStart, index),
      dinner,
    };
  });

  return { weekStart, dailyMenu };
}

export function refreshMenuDay(menu: WeeklyMenu, recipes: Recipe[], date: string): WeeklyMenu {
  const usedIds = new Set(
    menu.dailyMenu
      .filter((day) => day.date !== date)
      .flatMap((day) => day.dinner),
  );

  return {
    ...menu,
    dailyMenu: menu.dailyMenu.map((day) =>
      day.date === date ? { ...day, dinner: pickRecipes(recipes, usedIds) } : day,
    ),
  };
}

export function removeDeletedRecipesFromMenu(menu: WeeklyMenu, recipeIds: Set<string>): WeeklyMenu {
  return {
    ...menu,
    dailyMenu: menu.dailyMenu.map((day) => ({
      ...day,
      dinner: day.dinner.filter((id) => recipeIds.has(id)),
    })),
  };
}

export function buildShoppingList(
  menu: WeeklyMenu,
  recipes: Recipe[],
  checked: ShoppingCheckedState,
): ShoppingListItem[] {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemMap = new Map<string, ShoppingListItem>();

  for (const recipeId of menu.dailyMenu.flatMap((day) => day.dinner)) {
    const recipe = recipeMap.get(recipeId);
    if (!recipe) {
      continue;
    }

    for (const ingredient of recipe.ingredients) {
      const name = ingredient.name.trim();
      if (!name) {
        continue;
      }

      const key = name.toLocaleLowerCase("zh-CN");
      const existing = itemMap.get(key);
      const amount = ingredient.amount.trim() || "适量";

      if (existing) {
        existing.amounts.push(amount);
        if (!existing.recipeNames.includes(recipe.name)) {
          existing.recipeNames.push(recipe.name);
        }
      } else {
        itemMap.set(key, {
          name,
          amounts: [amount],
          recipeNames: [recipe.name],
          checked: Boolean(checked[key]),
        });
      }
    }
  }

  return Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function getShoppingCheckKey(name: string): string {
  return name.trim().toLocaleLowerCase("zh-CN");
}
