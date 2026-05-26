export type RecipeCategory = "午餐" | "晚餐" | "零食";
export type RecipeTaste = "咸" | "甜" | "辣" | "清淡" | "鲜" | "酸甜";
export type RecipeDifficulty = "简单" | "中等" | "困难";

export interface Ingredient {
  name: string;
  amount: string;
}

export interface Nutrition {
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  taste: RecipeTaste;
  ingredients: Ingredient[];
  steps: string[];
  cookTime: number;
  difficulty: RecipeDifficulty;
  nutrition: Nutrition;
  favorite: boolean;
  rating: number;
  cookedCount: number;
  servings?: string;
  tips?: string;
  substitutes?: string;
}

export interface WeeklyMenuDay {
  date: string;
  dinner: string[];
}

export interface WeeklyMenu {
  weekStart: string;
  dailyMenu: WeeklyMenuDay[];
}

export interface ShoppingListItem {
  name: string;
  amounts: string[];
  recipeNames: string[];
  checked: boolean;
}

export type ShoppingCheckedState = Record<string, boolean>;

export interface TrendingDish {
  id: string;
  name: string;
  source: "小红书" | "B站" | "综合";
  creator: string;
  creatorNote: string;
  heat: number;
  taste: RecipeTaste;
  difficulty: RecipeDifficulty;
  cookTime: number;
  ingredients: Ingredient[];
  steps: string[];
  reason: string;
  tags: string[];
  searchKeyword: string;
}

export interface AiDishRecommendation {
  id: string;
  name: string;
  country: string;
  cuisine: string;
  heat: number;
  reason: string;
  ingredients: Ingredient[];
  tags: string[];
  sourceKeywords: string[];
}

export interface AiCuisineGroup {
  country: string;
  cuisine: string;
  summary: string;
  dishes: AiDishRecommendation[];
}

export interface AiTrendReport {
  generatedAt: string;
  nextRefreshAt: string;
  source: "deepseek-api" | "fallback";
  groups: AiCuisineGroup[];
  notes?: string;
}

export interface AppState {
  recipes: Recipe[];
  weeklyMenu: WeeklyMenu;
  shoppingChecked: ShoppingCheckedState;
}
