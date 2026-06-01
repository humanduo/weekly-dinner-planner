import type { Recipe, ShoppingCheckedState, WeeklyMenu } from "./types";

export const STORAGE_KEYS = {
  recipes: "weekly-recipes:v1:recipes",
  weeklyMenu: "weekly-recipes:v1:weekly-menu",
  shoppingChecked: "weekly-recipes:v1:shopping-checked",
  likedTrendCreators: "weekly-recipes:v1:liked-trend-creators",
  lastUsername: "weekly-recipes:v1:last-username",
} as const;

export const sampleRecipes: Recipe[] = [
  {
    id: "sample-tomato-egg",
    name: "番茄炒蛋",
    category: "晚餐",
    taste: "酸甜",
    ingredients: [
      { name: "番茄", amount: "3个" },
      { name: "鸡蛋", amount: "3个" },
      { name: "葱", amount: "1根" },
    ],
    steps: ["番茄切块，鸡蛋打散。", "热锅炒蛋至凝固盛出。", "炒番茄出汁后倒回鸡蛋，加盐调味。"],
    cookTime: 15,
    difficulty: "简单",
    nutrition: { calories: 220, protein: 15, fat: 13, carbs: 10 },
    favorite: true,
    rating: 5,
    cookedCount: 0,
    servings: "2人",
    tips: "番茄先炒出汁，成品更下饭。",
    substitutes: "番茄可换成圣女果，味道更甜。",
  },
  {
    id: "sample-broccoli-beef",
    name: "西兰花炒牛肉",
    category: "晚餐",
    taste: "咸",
    ingredients: [
      { name: "牛肉", amount: "250g" },
      { name: "西兰花", amount: "1颗" },
      { name: "蒜", amount: "3瓣" },
    ],
    steps: ["牛肉切片，用生抽和淀粉腌10分钟。", "西兰花焯水。", "先炒牛肉，再加入西兰花和蒜末快炒。"],
    cookTime: 25,
    difficulty: "中等",
    nutrition: { calories: 380, protein: 32, fat: 20, carbs: 16 },
    favorite: true,
    rating: 5,
    cookedCount: 0,
    servings: "2人",
    tips: "牛肉最后回锅，口感更嫩。",
  },
  {
    id: "sample-pepper-chicken",
    name: "青椒鸡胸肉",
    category: "晚餐",
    taste: "咸",
    ingredients: [
      { name: "鸡胸肉", amount: "300g" },
      { name: "青椒", amount: "2个" },
      { name: "洋葱", amount: "半个" },
    ],
    steps: ["鸡胸肉切条并腌制。", "青椒和洋葱切丝。", "鸡肉炒熟后加入蔬菜翻炒。"],
    cookTime: 20,
    difficulty: "简单",
    nutrition: { calories: 310, protein: 38, fat: 8, carbs: 18 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "2人",
    substitutes: "鸡胸肉可换成鸡腿肉。",
  },
  {
    id: "sample-mapo-tofu",
    name: "家常麻婆豆腐",
    category: "晚餐",
    taste: "辣",
    ingredients: [
      { name: "豆腐", amount: "1盒" },
      { name: "猪肉末", amount: "120g" },
      { name: "豆瓣酱", amount: "1勺" },
    ],
    steps: ["豆腐切块焯水。", "炒香肉末和豆瓣酱。", "加水和豆腐炖煮，最后勾芡。"],
    cookTime: 25,
    difficulty: "中等",
    nutrition: { calories: 360, protein: 24, fat: 22, carbs: 14 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "2人",
    tips: "豆腐焯水能减少碎裂。",
  },
  {
    id: "sample-steamed-fish",
    name: "清蒸鲈鱼",
    category: "晚餐",
    taste: "清淡",
    ingredients: [
      { name: "鲈鱼", amount: "1条" },
      { name: "姜", amount: "5片" },
      { name: "葱", amount: "2根" },
    ],
    steps: ["鱼身擦干，铺姜葱。", "水开后上锅蒸8到10分钟。", "倒掉蒸汁，淋蒸鱼豉油和热油。"],
    cookTime: 20,
    difficulty: "中等",
    nutrition: { calories: 280, protein: 36, fat: 12, carbs: 3 },
    favorite: true,
    rating: 5,
    cookedCount: 0,
    servings: "2人",
    tips: "水开后再蒸，鱼肉更细嫩。",
  },
  {
    id: "sample-garlic-lettuce",
    name: "蒜蓉生菜",
    category: "晚餐",
    taste: "清淡",
    ingredients: [
      { name: "生菜", amount: "2颗" },
      { name: "蒜", amount: "4瓣" },
      { name: "蚝油", amount: "1勺" },
    ],
    steps: ["生菜洗净沥干。", "蒜末炒香后加入生菜。", "快速翻炒，加蚝油调味。"],
    cookTime: 10,
    difficulty: "简单",
    nutrition: { calories: 120, protein: 4, fat: 6, carbs: 10 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "2人",
  },
  {
    id: "sample-potato-ribs",
    name: "土豆炖排骨",
    category: "晚餐",
    taste: "咸",
    ingredients: [
      { name: "排骨", amount: "500g" },
      { name: "土豆", amount: "2个" },
      { name: "胡萝卜", amount: "1根" },
    ],
    steps: ["排骨焯水。", "炒糖色后加入排骨翻炒。", "加水炖30分钟，再放土豆和胡萝卜炖熟。"],
    cookTime: 50,
    difficulty: "中等",
    nutrition: { calories: 620, protein: 36, fat: 38, carbs: 34 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "3人",
    tips: "土豆后放，避免炖化。",
  },
  {
    id: "sample-shrimp-egg",
    name: "虾仁滑蛋",
    category: "晚餐",
    taste: "鲜",
    ingredients: [
      { name: "虾仁", amount: "200g" },
      { name: "鸡蛋", amount: "4个" },
      { name: "牛奶", amount: "2勺" },
    ],
    steps: ["虾仁去腥腌制。", "鸡蛋加牛奶打散。", "虾仁炒至变色后倒入蛋液，小火滑熟。"],
    cookTime: 15,
    difficulty: "简单",
    nutrition: { calories: 330, protein: 34, fat: 19, carbs: 6 },
    favorite: true,
    rating: 5,
    cookedCount: 0,
    servings: "2人",
  },
  {
    id: "sample-cabbage-vermicelli",
    name: "包菜粉丝",
    category: "晚餐",
    taste: "咸",
    ingredients: [
      { name: "包菜", amount: "半颗" },
      { name: "粉丝", amount: "1把" },
      { name: "鸡蛋", amount: "2个" },
    ],
    steps: ["粉丝泡软，包菜切丝。", "鸡蛋炒熟盛出。", "炒包菜和粉丝，最后加入鸡蛋调味。"],
    cookTime: 20,
    difficulty: "简单",
    nutrition: { calories: 300, protein: 13, fat: 12, carbs: 36 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "2人",
  },
  {
    id: "sample-mushroom-chicken-soup",
    name: "菌菇鸡汤",
    category: "晚餐",
    taste: "鲜",
    ingredients: [
      { name: "鸡腿", amount: "2只" },
      { name: "香菇", amount: "8朵" },
      { name: "金针菇", amount: "1把" },
    ],
    steps: ["鸡腿焯水。", "鸡腿和香菇加水炖煮35分钟。", "加入金针菇再煮5分钟，加盐调味。"],
    cookTime: 45,
    difficulty: "简单",
    nutrition: { calories: 420, protein: 35, fat: 24, carbs: 12 },
    favorite: false,
    rating: 4,
    cookedCount: 0,
    servings: "2到3人",
    tips: "菌菇先煎一下会更香。",
  },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadRecipes(): Recipe[] {
  const recipes = readJson<Recipe[] | null>(STORAGE_KEYS.recipes, null);
  if (recipes && recipes.length > 0) {
    return recipes;
  }

  writeJson(STORAGE_KEYS.recipes, sampleRecipes);
  return sampleRecipes;
}

export function saveRecipes(recipes: Recipe[]) {
  writeJson(STORAGE_KEYS.recipes, recipes);
}

export function loadWeeklyMenu(): WeeklyMenu | null {
  return readJson<WeeklyMenu | null>(STORAGE_KEYS.weeklyMenu, null);
}

export function saveWeeklyMenu(menu: WeeklyMenu) {
  writeJson(STORAGE_KEYS.weeklyMenu, menu);
}

export function loadShoppingChecked(): ShoppingCheckedState {
  return readJson<ShoppingCheckedState>(STORAGE_KEYS.shoppingChecked, {});
}

export function saveShoppingChecked(checked: ShoppingCheckedState) {
  writeJson(STORAGE_KEYS.shoppingChecked, checked);
}

export function loadLikedTrendCreators(): string[] {
  const creators = readJson<string[]>(STORAGE_KEYS.likedTrendCreators, []);
  return Array.isArray(creators) ? creators.filter(Boolean) : [];
}

export function saveLikedTrendCreators(creators: string[]) {
  writeJson(STORAGE_KEYS.likedTrendCreators, Array.from(new Set(creators)));
}

export function loadLastUsername() {
  return window.localStorage.getItem(STORAGE_KEYS.lastUsername) ?? "";
}

export function saveLastUsername(username: string) {
  window.localStorage.setItem(STORAGE_KEYS.lastUsername, username.trim());
}
