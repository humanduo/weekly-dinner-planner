import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildShoppingList,
  formatDate,
  generateWeeklyMenu,
  getDayLabel,
  getShoppingCheckKey,
  getWeekStart,
  refreshMenuDay,
  removeDeletedRecipesFromMenu,
} from "./menuGenerator";
import {
  loadLikedTrendCreators,
  loadRecipes,
  loadShoppingChecked,
  loadWeeklyMenu,
  saveLikedTrendCreators,
  saveRecipes,
  saveShoppingChecked,
  saveWeeklyMenu,
} from "./storage";
import type {
  Ingredient,
  Recipe,
  RecipeCategory,
  RecipeDifficulty,
  RecipeTaste,
  ShoppingCheckedState,
  AiTrendReport,
  AiDishRecommendation,
  TrendingDish,
} from "./types";
import { TRENDING_DISHES } from "./trending";
import { buildTrendingDishBatch } from "./trendBatch";
import {
  fetchAiTrends,
  fetchAppState,
  fetchCurrentUser,
  loginAccount,
  logoutAccount,
  refreshAiTrends,
  registerAccount,
  saveAppState,
  searchAiIngredientTrends,
  type AuthUser,
} from "./api";

type Tab = "menu" | "aiTrends" | "trends" | "recipes" | "shopping";

interface RecipeRecommendation {
  recipe: Recipe;
  matchedIngredients: string[];
  score: number;
}

const CATEGORY_OPTIONS: RecipeCategory[] = ["晚餐", "午餐", "零食"];
const TASTE_OPTIONS: RecipeTaste[] = ["咸", "甜", "辣", "清淡", "鲜", "酸甜"];
const DIFFICULTY_OPTIONS: RecipeDifficulty[] = ["简单", "中等", "困难"];

const initialRecipes = loadRecipes();
const currentWeekStart = getWeekStart();
const storedWeeklyMenu = loadWeeklyMenu();
const initialWeeklyMenu =
  storedWeeklyMenu?.weekStart === currentWeekStart
    ? storedWeeklyMenu
    : generateWeeklyMenu(initialRecipes, currentWeekStart);
saveWeeklyMenu(initialWeeklyMenu);

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `recipe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recipeToIngredientText(recipe?: Recipe) {
  return recipe?.ingredients.map((item) => `${item.name} ${item.amount}`.trim()).join("\n") ?? "";
}

function recipeToStepText(recipe?: Recipe) {
  return recipe?.steps.join("\n") ?? "";
}

function parseIngredients(text: string): Ingredient[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...amountParts] = line.split(/\s+/);
      return {
        name,
        amount: amountParts.join(" ") || "适量",
      };
    });
}

function parseSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function numberOrUndefined(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : undefined;
}

function normalizeIngredientName(name: string) {
  return name.trim().toLocaleLowerCase("zh-CN");
}

function getTodayMenuDate(menuDates: string[]) {
  const today = formatDate(new Date());
  return menuDates.includes(today) ? today : menuDates[0];
}

function scoreRecipesByIngredients(recipes: Recipe[], selectedIngredients: string[]): RecipeRecommendation[] {
  const selectedSet = new Set(selectedIngredients.map(normalizeIngredientName));
  const dinnerRecipes = recipes.filter((recipe) => recipe.category === "晚餐");

  return dinnerRecipes
    .map((recipe) => {
      const matchedIngredients = recipe.ingredients
        .map((ingredient) => ingredient.name)
        .filter((name) => selectedSet.has(normalizeIngredientName(name)));
      const score = matchedIngredients.length * 10 + (recipe.favorite ? 3 : 0) + recipe.rating - recipe.cookedCount * 0.2;
      return { recipe, matchedIngredients, score };
    })
    .filter((item) => item.matchedIngredients.length > 0)
    .sort((a, b) => b.score - a.score || a.recipe.cookTime - b.recipe.cookTime || a.recipe.name.localeCompare(b.recipe.name));
}

function getWeeklyTrendScore(dish: TrendingDish, weekStart: string) {
  const seed = [...`${dish.id}-${weekStart}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return dish.heat + (seed % 9);
}

function getSourceSearchUrl(source: TrendingDish["source"], keyword: string) {
  const encoded = encodeURIComponent(keyword);
  if (source === "B站") {
    return `https://search.bilibili.com/all?keyword=${encoded}`;
  }
  if (source === "小红书") {
    return `https://www.xiaohongshu.com/search_result?keyword=${encoded}`;
  }
  return `https://www.xiaohongshu.com/search_result?keyword=${encoded}`;
}

function trendToRecipe(dish: TrendingDish): Recipe {
  const sourceLabel = `${dish.source} ${dish.creator}`;

  return {
    id: createId(),
    name: dish.name,
    category: "晚餐",
    taste: dish.taste,
    ingredients: dish.ingredients,
    steps: dish.steps,
    cookTime: dish.cookTime,
    difficulty: dish.difficulty,
    nutrition: {},
    favorite: false,
    rating: 0,
    cookedCount: 0,
    servings: "2人",
    tips: `来自${sourceLabel}热门灵感：${dish.reason}`,
    substitutes: "保存前可以按你家现有食材调整。",
  };
}

function aiDishToRecipe(dish: AiDishRecommendation): Recipe {
  return {
    id: createId(),
    name: dish.name,
    category: "晚餐",
    taste: "咸",
    ingredients: dish.ingredients,
    steps: [`搜索「${dish.sourceKeywords[0] ?? dish.name}」确认你喜欢的做法。`, "按家里现有食材调整调味。", "完成后把这份草稿改成你的固定菜谱。"],
    cookTime: 25,
    difficulty: "中等",
    nutrition: {},
    favorite: false,
    rating: 0,
    cookedCount: 0,
    servings: "2人",
    tips: `${dish.country} / ${dish.cuisine}：${dish.reason}`,
    substitutes: `推荐搜索词：${dish.sourceKeywords.join(" / ")}`,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isStateLoading, setIsStateLoading] = useState(false);
  const [hasLoadedUserState, setHasLoadedUserState] = useState(false);
  const [stateError, setStateError] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [weeklyMenu, setWeeklyMenu] = useState(initialWeeklyMenu);
  const [shoppingChecked, setShoppingChecked] = useState<ShoppingCheckedState>(() => loadShoppingChecked());
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategory | "全部">("全部");
  const [tasteFilter, setTasteFilter] = useState<RecipeTaste | "全部">("全部");
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [aiTrendReport, setAiTrendReport] = useState<AiTrendReport | null>(null);
  const [isAiTrendLoading, setIsAiTrendLoading] = useState(false);
  const [aiTrendError, setAiTrendError] = useState("");
  const [aiIngredientInput, setAiIngredientInput] = useState("");
  const [aiIngredientReport, setAiIngredientReport] = useState<AiTrendReport | null>(null);
  const [isIngredientSearchLoading, setIsIngredientSearchLoading] = useState(false);
  const [ingredientSearchError, setIngredientSearchError] = useState("");
  const [trendRefreshSeed, setTrendRefreshSeed] = useState(0);
  const [likedTrendCreators, setLikedTrendCreators] = useState<string[]>(() => loadLikedTrendCreators());

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const selectedRecipe = selectedRecipeId ? recipeMap.get(selectedRecipeId) ?? null : null;
  const shoppingList = useMemo(
    () => buildShoppingList(weeklyMenu, recipes, shoppingChecked),
    [weeklyMenu, recipes, shoppingChecked],
  );

  const filteredRecipes = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase("zh-CN");
    return recipes
      .filter((recipe) => {
        const matchesKeyword =
          !keyword ||
          recipe.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLocaleLowerCase("zh-CN").includes(keyword));
        const matchesCategory = categoryFilter === "全部" || recipe.category === categoryFilter;
        const matchesTaste = tasteFilter === "全部" || recipe.taste === tasteFilter;
        return matchesKeyword && matchesCategory && matchesTaste;
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.rating - a.rating || a.name.localeCompare(b.name));
  }, [categoryFilter, recipes, searchText, tasteFilter]);

  const ingredientOptions = useMemo(() => {
    const ingredientCounts = new Map<string, { name: string; count: number }>();
    for (const recipe of recipes.filter((item) => item.category === "晚餐")) {
      for (const ingredient of recipe.ingredients) {
        const key = normalizeIngredientName(ingredient.name);
        if (!key) {
          continue;
        }
        const existing = ingredientCounts.get(key);
        ingredientCounts.set(key, {
          name: existing?.name ?? ingredient.name.trim(),
          count: (existing?.count ?? 0) + 1,
        });
      }
    }

    return Array.from(ingredientCounts.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
      .map((item) => item.name);
  }, [recipes]);

  const recommendedRecipes = useMemo(
    () => scoreRecipesByIngredients(recipes, selectedIngredients).slice(0, 6),
    [recipes, selectedIngredients],
  );
  const weeklyTrends = useMemo(
    () => buildTrendingDishBatch(TRENDING_DISHES, weeklyMenu.weekStart, trendRefreshSeed, likedTrendCreators),
    [likedTrendCreators, trendRefreshSeed, weeklyMenu.weekStart],
  );
  const likedTrendSet = useMemo(() => new Set(likedTrendCreators), [likedTrendCreators]);
  const aiDishCount = aiTrendReport?.groups.reduce((sum, group) => sum + group.dishes.length, 0) ?? 0;
  const todayMenuDate = getTodayMenuDate(weeklyMenu.dailyMenu.map((day) => day.date));
  const todayMenuDay = weeklyMenu.dailyMenu.find((day) => day.date === todayMenuDate) ?? weeklyMenu.dailyMenu[0];
  const tonightRecipes = todayMenuDay?.dinner.map((recipeId) => recipeMap.get(recipeId)).filter(Boolean) as Recipe[];
  const favoriteCount = recipes.filter((recipe) => recipe.favorite).length;
  const checkedShoppingCount = shoppingList.filter((item) => item.checked).length;

  useEffect(() => {
    let ignore = false;
    fetchCurrentUser()
      .then((user) => {
        if (!ignore) {
          setAuthUser(user);
          setHasLoadedUserState(false);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) {
          setIsAuthChecking(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    let ignore = false;
    setHasLoadedUserState(false);
    setIsStateLoading(true);
    fetchAppState()
      .then((state) => {
        if (ignore) {
          return;
        }
        setRecipes(state.recipes);
        setWeeklyMenu(state.weeklyMenu);
        setShoppingChecked(state.shoppingChecked);
        setStateError("");
        saveRecipes(state.recipes);
        saveWeeklyMenu(state.weeklyMenu);
        saveShoppingChecked(state.shoppingChecked);
        setHasLoadedUserState(true);
      })
      .catch((error) => {
        if (!ignore) {
          setStateError(error instanceof Error ? error.message : "读取账号数据失败");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsStateLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    setIsAiTrendLoading(true);
    fetchAiTrends()
      .then((report) => {
        setAiTrendReport(report);
        setAiTrendError("");
      })
      .catch((error) => {
        setAiTrendError(error instanceof Error ? error.message : "AI 热门推荐加载失败");
      })
      .finally(() => {
        setIsAiTrendLoading(false);
      });
  }, [authUser]);

  function syncBackend(nextRecipes = recipes, nextMenu = weeklyMenu, nextChecked = shoppingChecked) {
    if (!authUser) {
      return;
    }

    saveAppState({
      recipes: nextRecipes,
      weeklyMenu: nextMenu,
      shoppingChecked: nextChecked,
    }).catch(() => {
      // Keep the app responsive even if the API is temporarily unavailable.
    });
  }

  function persistRecipes(nextRecipes: Recipe[]) {
    setRecipes(nextRecipes);
    saveRecipes(nextRecipes);
    syncBackend(nextRecipes, weeklyMenu, shoppingChecked);
  }

  function persistWeeklyMenu(nextMenu = weeklyMenu) {
    setWeeklyMenu(nextMenu);
    saveWeeklyMenu(nextMenu);
    syncBackend(recipes, nextMenu, shoppingChecked);
  }

  function persistShoppingChecked(nextChecked: ShoppingCheckedState) {
    setShoppingChecked(nextChecked);
    saveShoppingChecked(nextChecked);
    syncBackend(recipes, weeklyMenu, nextChecked);
  }

  function openNewRecipeForm() {
    setEditingRecipe(null);
    setIsFormOpen(true);
  }

  function openEditRecipeForm(recipe: Recipe) {
    setEditingRecipe(recipe);
    setIsFormOpen(true);
  }

  function handleSaveRecipe(recipe: Recipe) {
    const exists = recipes.some((item) => item.id === recipe.id);
    const nextRecipes = exists ? recipes.map((item) => (item.id === recipe.id ? recipe : item)) : [recipe, ...recipes];
    persistRecipes(nextRecipes);
    setSelectedRecipeId(recipe.id);
    setIsFormOpen(false);
    setActiveTab("recipes");
  }

  function handleDeleteRecipe(recipe: Recipe) {
    const confirmed = window.confirm(`删除「${recipe.name}」？本周菜单中也会移除这道菜。`);
    if (!confirmed) {
      return;
    }

    const nextRecipes = recipes.filter((item) => item.id !== recipe.id);
    const validIds = new Set(nextRecipes.map((item) => item.id));
    const nextMenu = removeDeletedRecipesFromMenu(weeklyMenu, validIds);
    setRecipes(nextRecipes);
    setWeeklyMenu(nextMenu);
    saveRecipes(nextRecipes);
    saveWeeklyMenu(nextMenu);
    syncBackend(nextRecipes, nextMenu, shoppingChecked);
    if (selectedRecipeId === recipe.id) {
      setSelectedRecipeId(null);
    }
  }

  function toggleFavorite(recipeId: string) {
    const nextRecipes = recipes.map((recipe) =>
      recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite } : recipe,
    );
    persistRecipes(nextRecipes);
  }

  function markCooked(recipeId: string) {
    const nextRecipes = recipes.map((recipe) =>
      recipe.id === recipeId ? { ...recipe, cookedCount: recipe.cookedCount + 1 } : recipe,
    );
    persistRecipes(nextRecipes);
  }

  function refreshWholeWeek() {
    persistWeeklyMenu(generateWeeklyMenu(recipes, getWeekStart()));
  }

  function refreshDay(date: string) {
    persistWeeklyMenu(refreshMenuDay(weeklyMenu, recipes, date));
  }

  function toggleShoppingItem(name: string) {
    const key = getShoppingCheckKey(name);
    persistShoppingChecked({
      ...shoppingChecked,
      [key]: !shoppingChecked[key],
    });
  }

  function toggleIngredient(name: string) {
    setSelectedIngredients((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  function addRecipeToToday(recipeId: string) {
    const date = getTodayMenuDate(weeklyMenu.dailyMenu.map((day) => day.date));
    const nextMenu = {
      ...weeklyMenu,
      dailyMenu: weeklyMenu.dailyMenu.map((day) => {
        if (day.date !== date || day.dinner.includes(recipeId)) {
          return day;
        }

        const dinner = day.dinner.length >= 3 ? [recipeId, ...day.dinner.slice(1)] : [recipeId, ...day.dinner];
        return { ...day, dinner };
      }),
    };
    persistWeeklyMenu(nextMenu);
      setActiveTab("menu");
  }

  function handleAuthSuccess(user: AuthUser) {
    setHasLoadedUserState(false);
    setAuthUser(user);
    setStateError("");
    setActiveTab("menu");
  }

  function handleLogout() {
    logoutAccount()
      .catch(() => undefined)
      .finally(() => {
        setAuthUser(null);
        setHasLoadedUserState(false);
        setSelectedRecipeId(null);
        setIsFormOpen(false);
      });
  }

  function pickOneRecommendation() {
    if (recommendedRecipes.length === 0) {
      return;
    }

    const topRecipes = recommendedRecipes.slice(0, 4);
    const picked = topRecipes[Math.floor(Math.random() * topRecipes.length)];
    setSelectedRecipeId(picked.recipe.id);
  }

  function openTrendAsRecipe(dish: TrendingDish) {
    setEditingRecipe(trendToRecipe(dish));
    setIsFormOpen(true);
  }

  function refreshTrendBatch() {
    setTrendRefreshSeed((seed) => seed + 1);
  }

  function toggleTrendCreatorLike(creator: string) {
    setLikedTrendCreators((current) => {
      const next = current.includes(creator) ? current.filter((item) => item !== creator) : [creator, ...current];
      saveLikedTrendCreators(next);
      return next;
    });
  }

  function openAiDishAsRecipe(dish: AiDishRecommendation) {
    setEditingRecipe(aiDishToRecipe(dish));
    setIsFormOpen(true);
  }

  function handleRefreshAiTrends() {
    setIsAiTrendLoading(true);
    refreshAiTrends()
      .then((report) => {
        setAiTrendReport(report);
        setAiTrendError("");
      })
      .catch((error) => {
        setAiTrendError(error instanceof Error ? error.message : "AI 热门推荐刷新失败");
      })
      .finally(() => {
        setIsAiTrendLoading(false);
      });
  }

  function handleIngredientTrendSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredient = aiIngredientInput.trim();
    if (!ingredient) {
      setIngredientSearchError("先输入一个食材，比如：鸡胸肉、土豆、虾。");
      return;
    }

    setIsIngredientSearchLoading(true);
    searchAiIngredientTrends(ingredient)
      .then((report) => {
        setAiIngredientReport(report);
        setIngredientSearchError("");
      })
      .catch((error) => {
        setIngredientSearchError(error instanceof Error ? error.message : "食材热门菜品搜索失败");
      })
      .finally(() => {
        setIsIngredientSearchLoading(false);
      });
  }

  if (isAuthChecking) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">正在进入厨房</p>
          <h1>正在检查登录状态</h1>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  if (!hasLoadedUserState) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <p className="eyebrow">账号数据</p>
            <h1>{stateError ? "暂时没读到你的菜谱" : "正在端出你的晚餐计划"}</h1>
            <p>{stateError || "正在读取菜谱、周菜单和购物清单。"}</p>
          </div>
          <div className="auth-form">
            <div className={stateError ? "status-banner error" : "status-banner"}>
              {stateError || "正在加载，请稍等..."}
            </div>
            {stateError && (
              <button className="secondary-button" type="button" onClick={handleLogout}>
                退出重新登录
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <section className="top-stage" aria-label="晚餐工作台">
        <header className="app-header">
          <div className="brand-lockup">
            <p className="eyebrow">本周计划 / {weeklyMenu.weekStart}</p>
            <h1>周晚餐备餐台</h1>
          </div>

          <div className="header-actions">
            <div className="account-pill">
              <span>账号</span>
              <strong>{authUser.username}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={refreshWholeWeek}>
              换一周
            </button>
            <button className="primary-button" type="button" onClick={openNewRecipeForm}>
              新增菜谱
            </button>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              退出
            </button>
          </div>
        </header>

        {(isStateLoading || stateError) && (
          <div className={stateError ? "status-banner error" : "status-banner"}>
            {stateError || "正在读取你的账号数据..."}
          </div>
        )}

        <div className="tonight-board">
          <div className="date-ticket">
            <span>{getDayLabel(todayMenuDate)}</span>
            <strong>{todayMenuDate.slice(5)}</strong>
          </div>
          <div className="tonight-copy">
            <p className="eyebrow">今晚餐单</p>
            <h2>{tonightRecipes.length > 0 ? tonightRecipes.map((recipe) => recipe.name).join(" / ") : "还没安排"}</h2>
          </div>
          <div className="stat-strip" aria-label="当前数据概览">
            <span>
              <strong>{recipes.length}</strong>
              我的菜谱
            </span>
            <span>
              <strong>{favoriteCount}</strong>
              收藏
            </span>
            <span>
              <strong>{aiDishCount || weeklyTrends.length}</strong>
              AI 推荐
            </span>
            <span>
              <strong>{checkedShoppingCount}/{shoppingList.length}</strong>
              已买
            </span>
          </div>
        </div>

        <nav className="tabs" aria-label="主导航">
          <button className={activeTab === "menu" ? "active" : ""} type="button" onClick={() => setActiveTab("menu")}>
            本周菜单
          </button>
          <button
            className={activeTab === "aiTrends" ? "active" : ""}
            type="button"
            onClick={() => setActiveTab("aiTrends")}
          >
            AI 菜系
          </button>
          <button
            className={activeTab === "trends" ? "active" : ""}
            type="button"
            onClick={() => setActiveTab("trends")}
          >
            热门灵感
          </button>
          <button
            className={activeTab === "recipes" ? "active" : ""}
            type="button"
            onClick={() => setActiveTab("recipes")}
          >
            菜谱库
          </button>
          <button
            className={activeTab === "shopping" ? "active" : ""}
            type="button"
            onClick={() => setActiveTab("shopping")}
          >
            购物清单
          </button>
        </nav>
      </section>

      <main>
        {activeTab === "menu" && (
          <div className="menu-layout">
            <section className="panel menu-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{weeklyMenu.weekStart} 开始</p>
                  <h2>本周晚餐</h2>
                </div>
                <button className="secondary-button" type="button" onClick={refreshWholeWeek}>
                  刷新整周
                </button>
              </div>

              <div className="week-grid">
                {weeklyMenu.dailyMenu.map((day) => (
                  <article className={day.date === todayMenuDate ? "day-card today" : "day-card"} key={day.date}>
                    <div className="day-card-header">
                      <div>
                        <h3>{getDayLabel(day.date)}</h3>
                        <span>{day.date}</span>
                      </div>
                      <button className="icon-button" type="button" onClick={() => refreshDay(day.date)} title="刷新当天">
                        刷新
                      </button>
                    </div>
                    <div className="dish-list">
                      {day.dinner.length === 0 ? (
                        <p className="empty-text">菜谱不足，先新增晚餐菜谱。</p>
                      ) : (
                        day.dinner.map((recipeId) => {
                          const recipe = recipeMap.get(recipeId);
                          if (!recipe) {
                            return null;
                          }

                          return (
                            <button
                              className="dish-row"
                              key={recipe.id}
                              type="button"
                              onClick={() => setSelectedRecipeId(recipe.id)}
                            >
                              <span className="dish-name">{recipe.name}</span>
                              <span className="tag-row">
                                <span>{recipe.taste}</span>
                                <span>{recipe.difficulty}</span>
                                <span>{recipe.cookTime}分钟</span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="panel inspiration-panel">
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">不知道吃什么时</p>
                  <h2>按食材挑菜</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={pickOneRecommendation}
                  disabled={recommendedRecipes.length === 0}
                >
                  随机挑一道
                </button>
              </div>

              <div className="ingredient-cloud" aria-label="选择喜欢的食材">
                {ingredientOptions.map((ingredient) => (
                  <button
                    className={selectedIngredients.includes(ingredient) ? "ingredient-chip selected" : "ingredient-chip"}
                    type="button"
                    key={ingredient}
                    aria-pressed={selectedIngredients.includes(ingredient)}
                    onClick={() => toggleIngredient(ingredient)}
                  >
                    {ingredient}
                  </button>
                ))}
              </div>

              {selectedIngredients.length > 0 && (
                <button className="text-button" type="button" onClick={() => setSelectedIngredients([])}>
                  清空已选食材
                </button>
              )}

              <div className="recommendation-list">
                {selectedIngredients.length === 0 ? (
                  <p className="empty-text">先点几个你今天想吃的食材，我会按匹配度把菜排出来。</p>
                ) : recommendedRecipes.length === 0 ? (
                  <p className="empty-text">还没有匹配的晚餐菜谱，可以先去菜谱库新增一道。</p>
                ) : (
                  recommendedRecipes.map(({ recipe, matchedIngredients }) => (
                    <article className="recommendation-card" key={recipe.id}>
                      <button className="recommendation-main" type="button" onClick={() => setSelectedRecipeId(recipe.id)}>
                        <strong>{recipe.name}</strong>
                        <span>命中：{matchedIngredients.join("、")}</span>
                        <small>
                          {recipe.taste} / {recipe.difficulty} / {recipe.cookTime}分钟
                        </small>
                      </button>
                      <button className="small-primary-button" type="button" onClick={() => addRecipeToToday(recipe.id)}>
                        今天吃它
                      </button>
                    </article>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}

        {activeTab === "aiTrends" && (
          <section className="panel trends-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">每 2 天自动刷新 / 按国家菜系分组</p>
                <h2>DeepSeek 菜系推荐</h2>
              </div>
              <button className="secondary-button" type="button" onClick={handleRefreshAiTrends} disabled={isAiTrendLoading}>
                {isAiTrendLoading ? "刷新中" : "立即刷新"}
              </button>
            </div>

            {aiTrendError && (
              <div className="trend-note trend-note-error">
                <strong>AI 推荐暂时不可用</strong>
                <span>{aiTrendError}</span>
              </div>
            )}

            <form className="ai-ingredient-search" onSubmit={handleIngredientTrendSearch}>
              <div>
                <p className="eyebrow">按食材搜索热门菜</p>
                <h3>输入一个食材，让 DeepSeek 按国家菜系推荐做法</h3>
              </div>
              <label>
                <span>食材</span>
                <input
                  value={aiIngredientInput}
                  onChange={(event) => setAiIngredientInput(event.target.value)}
                  placeholder="例如：鸡胸肉、土豆、虾、豆腐"
                />
              </label>
              <button className="primary-button" type="submit" disabled={isIngredientSearchLoading}>
                {isIngredientSearchLoading ? "搜索中" : "搜索热门菜"}
              </button>
              {ingredientSearchError && <p className="form-error">{ingredientSearchError}</p>}
            </form>

            {aiIngredientReport && (
              <section className="ai-ingredient-result" aria-label="食材热门菜品搜索结果">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">食材专项结果</p>
                    <h2>{aiIngredientInput.trim()} 的热门菜品</h2>
                  </div>
                  <span className="result-source">
                    {aiIngredientReport.source === "deepseek-api" ? "DeepSeek" : "备用"}
                  </span>
                </div>
                <p className="empty-text">{aiIngredientReport.notes}</p>
                <AiCuisineGrid report={aiIngredientReport} onAddRecipe={openAiDishAsRecipe} />
              </section>
            )}

            {isAiTrendLoading && !aiTrendReport ? (
              <p className="empty-text">正在读取 AI 热门推荐...</p>
            ) : (
              <AiCuisineGrid report={aiTrendReport} onAddRecipe={openAiDishAsRecipe} />
            )}
          </section>
        )}

        {activeTab === "trends" && (
          <section className="panel trends-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">B站 / 小红书热门创作者</p>
                <h2>UP主热门菜灵感</h2>
              </div>
              <div className="trend-heading-actions">
                <button className="secondary-button" type="button" onClick={refreshTrendBatch}>
                  换一批
                </button>
                <button className="secondary-button" type="button" onClick={() => setActiveTab("recipes")}>
                  回菜谱库
                </button>
              </div>
            </div>

            <div className="trend-note">
              <strong>按创作者找菜</strong>
              <span>
                这里优先放 B站 UP主和小红书高热美食博主的代表菜方向。喜欢某个创作者后，后续换一批会优先推荐同路线菜品。
              </span>
            </div>

            {likedTrendCreators.length > 0 && (
              <div className="liked-creator-strip" aria-label="喜欢的创作者">
                <span>喜欢的UP主</span>
                {likedTrendCreators.map((creator) => (
                  <button type="button" key={creator} onClick={() => toggleTrendCreatorLike(creator)}>
                    {creator}
                  </button>
                ))}
              </div>
            )}

            <div className="trend-grid">
              {weeklyTrends.map((dish, index) => {
                const isCreatorLiked = likedTrendSet.has(dish.creator);

                return (
                  <article className={isCreatorLiked ? "trend-card liked" : "trend-card"} key={dish.id}>
                    <div className="trend-rank">#{index + 1}</div>
                    <div className="trend-card-main">
                      <div className="trend-card-header">
                        <div>
                          <p className="eyebrow">{dish.source} / 热度 {getWeeklyTrendScore(dish, weeklyMenu.weekStart)}</p>
                          <h3>{dish.name}</h3>
                        </div>
                        <span>{dish.cookTime}分钟</span>
                      </div>

                      <div className="creator-line">
                        <div>
                          <strong>{dish.creator}</strong>
                          {isCreatorLiked && <em>喜欢</em>}
                        </div>
                        <span>{dish.creatorNote}</span>
                      </div>

                      <p>{dish.reason}</p>

                      <div className="tag-row">
                        {dish.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>

                      <div className="trend-actions">
                        <button
                          className={isCreatorLiked ? "creator-like-button active" : "creator-like-button"}
                          type="button"
                          onClick={() => toggleTrendCreatorLike(dish.creator)}
                          aria-pressed={isCreatorLiked}
                        >
                          {isCreatorLiked ? "已喜欢UP主" : "喜欢UP主"}
                        </button>
                        <a href={getSourceSearchUrl(dish.source, dish.searchKeyword)} target="_blank" rel="noreferrer">
                          去{dish.source === "综合" ? "小红书" : dish.source}搜这道
                        </a>
                        <a
                          href={getSourceSearchUrl(dish.source === "B站" ? "小红书" : "B站", dish.searchKeyword)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          跨平台搜
                        </a>
                        <button className="small-primary-button" type="button" onClick={() => openTrendAsRecipe(dish)}>
                          加入菜谱草稿
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "recipes" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{recipes.length} 道菜</p>
                <h2>菜谱库</h2>
              </div>
              <button className="primary-button" type="button" onClick={openNewRecipeForm}>
                新增菜谱
              </button>
            </div>

            <div className="filters">
              <label>
                <span>搜索</span>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="菜名或食材"
                />
              </label>
              <label>
                <span>类别</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as RecipeCategory | "全部")}
                >
                  <option value="全部">全部</option>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option value={category} key={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>口味</span>
                <select
                  value={tasteFilter}
                  onChange={(event) => setTasteFilter(event.target.value as RecipeTaste | "全部")}
                >
                  <option value="全部">全部</option>
                  {TASTE_OPTIONS.map((taste) => (
                    <option value={taste} key={taste}>
                      {taste}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="recipe-list">
              {filteredRecipes.length === 0 ? (
                <p className="empty-text">没有匹配的菜谱。</p>
              ) : (
                filteredRecipes.map((recipe) => (
                  <article className="recipe-item" key={recipe.id}>
                    <button className="recipe-main" type="button" onClick={() => setSelectedRecipeId(recipe.id)}>
                      <strong>{recipe.name}</strong>
                      <span>
                        {recipe.category} / {recipe.taste} / {recipe.difficulty} / {recipe.cookTime}分钟
                      </span>
                      <span>
                        评分 {recipe.rating || "未评"} / 5，做过 {recipe.cookedCount} 次
                      </span>
                    </button>
                    <div className="recipe-actions">
                      <button type="button" onClick={() => toggleFavorite(recipe.id)}>
                        {recipe.favorite ? "已收藏" : "收藏"}
                      </button>
                      <button type="button" onClick={() => openEditRecipeForm(recipe)}>
                        编辑
                      </button>
                      <button className="danger-button" type="button" onClick={() => handleDeleteRecipe(recipe)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "shopping" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">由本周菜单自动汇总</p>
                <h2>购物清单</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => persistShoppingChecked({})}>
                清空勾选
              </button>
            </div>

            <div className="shopping-list">
              {shoppingList.length === 0 ? (
                <p className="empty-text">本周菜单还没有可汇总的食材。</p>
              ) : (
                shoppingList.map((item) => (
                  <label className={item.checked ? "shopping-item checked" : "shopping-item"} key={item.name}>
                    <input checked={item.checked} type="checkbox" onChange={() => toggleShoppingItem(item.name)} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.amounts.join(" + ")}</small>
                      <em>{item.recipeNames.join("、")}</em>
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipeId(null)}
          onEdit={() => openEditRecipeForm(selectedRecipe)}
          onFavorite={() => toggleFavorite(selectedRecipe.id)}
          onCooked={() => markCooked(selectedRecipe.id)}
        />
      )}

      {isFormOpen && (
        <RecipeForm
          recipe={editingRecipe}
          onCancel={() => setIsFormOpen(false)}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  );
}

interface AuthScreenProps {
  onSuccess: (user: AuthUser) => void;
}

function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (isRegistering && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    const action = isRegistering ? registerAccount(username, password) : loginAccount(username, password);
    action
      .then(onSuccess)
      .catch((submitError) => {
        setError(submitError instanceof Error ? submitError.message : "账号操作失败");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setConfirmPassword("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">Weekly Dinner Planner</p>
          <h1>先登录，再安排这一周吃什么</h1>
          <p>每个账号都会有自己的菜谱库、周菜单和购物清单。注册后会自动带入一份初始菜谱，后面就按你的习惯保存。</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-toggle" role="tablist" aria-label="登录或注册">
            <button
              className={!isRegistering ? "active" : ""}
              type="button"
              onClick={() => switchMode("login")}
              aria-selected={!isRegistering}
            >
              登录
            </button>
            <button
              className={isRegistering ? "active" : ""}
              type="button"
              onClick={() => switchMode("register")}
              aria-selected={isRegistering}
            >
              注册
            </button>
          </div>

          <label>
            <span>账号名</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例如：humanduo"
            />
          </label>

          <label>
            <span>密码</span>
            <input
              autoComplete={isRegistering ? "new-password" : "current-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
            />
          </label>

          {isRegistering && (
            <label>
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再输入一次密码"
              />
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "处理中..." : isRegistering ? "创建账号" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}

interface RecipeDetailProps {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onCooked: () => void;
}

function RecipeDetail({ recipe, onClose, onEdit, onFavorite, onCooked }: RecipeDetailProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recipe-detail-title">
      <article className="modal-card detail-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {recipe.category} / {recipe.taste}
            </p>
            <h2 id="recipe-detail-title">{recipe.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="metric-grid">
          <span>时间：{recipe.cookTime}分钟</span>
          <span>难度：{recipe.difficulty}</span>
          <span>评分：{recipe.rating || "未评"} / 5</span>
          <span>做过：{recipe.cookedCount} 次</span>
          {recipe.servings && <span>份量：{recipe.servings}</span>}
        </div>

        <div className="detail-grid">
          <section>
            <h3>食材</h3>
            <ul>
              {recipe.ingredients.map((ingredient) => (
                <li key={`${ingredient.name}-${ingredient.amount}`}>
                  <span>{ingredient.name}</span>
                  <strong>{ingredient.amount}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>步骤</h3>
            <ol>
              {recipe.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </div>

        <section className="nutrition-strip">
          <span>热量 {recipe.nutrition.calories ?? "-"} kcal</span>
          <span>蛋白质 {recipe.nutrition.protein ?? "-"} g</span>
          <span>脂肪 {recipe.nutrition.fat ?? "-"} g</span>
          <span>碳水 {recipe.nutrition.carbs ?? "-"} g</span>
        </section>

        {(recipe.tips || recipe.substitutes) && (
          <div className="note-block">
            {recipe.tips && <p>小技巧：{recipe.tips}</p>}
            {recipe.substitutes && <p>可替换：{recipe.substitutes}</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onFavorite}>
            {recipe.favorite ? "取消收藏" : "收藏"}
          </button>
          <button type="button" onClick={onCooked}>
            标记已做
          </button>
          <button className="primary-button" type="button" onClick={onEdit}>
            编辑菜谱
          </button>
        </div>
      </article>
    </div>
  );
}

interface RecipeFormProps {
  recipe: Recipe | null;
  onCancel: () => void;
  onSave: (recipe: Recipe) => void;
}

function RecipeForm({ recipe, onCancel, onSave }: RecipeFormProps) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState<RecipeCategory>(recipe?.category ?? "晚餐");
  const [taste, setTaste] = useState<RecipeTaste>(recipe?.taste ?? "咸");
  const [difficulty, setDifficulty] = useState<RecipeDifficulty>(recipe?.difficulty ?? "简单");
  const [cookTime, setCookTime] = useState(String(recipe?.cookTime ?? 20));
  const [ingredientsText, setIngredientsText] = useState(recipeToIngredientText(recipe ?? undefined));
  const [stepsText, setStepsText] = useState(recipeToStepText(recipe ?? undefined));
  const [favorite, setFavorite] = useState(recipe?.favorite ?? false);
  const [rating, setRating] = useState(String(recipe?.rating ?? 0));
  const [servings, setServings] = useState(recipe?.servings ?? "");
  const [tips, setTips] = useState(recipe?.tips ?? "");
  const [substitutes, setSubstitutes] = useState(recipe?.substitutes ?? "");
  const [calories, setCalories] = useState(String(recipe?.nutrition.calories ?? ""));
  const [protein, setProtein] = useState(String(recipe?.nutrition.protein ?? ""));
  const [fat, setFat] = useState(String(recipe?.nutrition.fat ?? ""));
  const [carbs, setCarbs] = useState(String(recipe?.nutrition.carbs ?? ""));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedIngredients = parseIngredients(ingredientsText);
    const parsedSteps = parseSteps(stepsText);
    const parsedName = name.trim();

    if (!parsedName || parsedIngredients.length === 0 || parsedSteps.length === 0) {
      window.alert("请至少填写菜名、食材和步骤。");
      return;
    }

    onSave({
      id: recipe?.id ?? createId(),
      name: parsedName,
      category,
      taste,
      ingredients: parsedIngredients,
      steps: parsedSteps,
      cookTime: Number(cookTime) || 20,
      difficulty,
      nutrition: {
        calories: numberOrUndefined(calories),
        protein: numberOrUndefined(protein),
        fat: numberOrUndefined(fat),
        carbs: numberOrUndefined(carbs),
      },
      favorite,
      rating: Math.max(0, Math.min(5, Number(rating) || 0)),
      cookedCount: recipe?.cookedCount ?? 0,
      servings: servings.trim() || undefined,
      tips: tips.trim() || undefined,
      substitutes: substitutes.trim() || undefined,
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recipe-form-title">
      <form className="modal-card form-card" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{recipe ? "编辑" : "新增"}</p>
            <h2 id="recipe-form-title">{recipe ? recipe.name : "新增菜谱"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel}>
            关闭
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>菜名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：番茄炒蛋" />
          </label>
          <label>
            <span>类别</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as RecipeCategory)}>
              {CATEGORY_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>口味</span>
            <select value={taste} onChange={(event) => setTaste(event.target.value as RecipeTaste)}>
              {TASTE_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>难度</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as RecipeDifficulty)}>
              {DIFFICULTY_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>时间（分钟）</span>
            <input min="1" type="number" value={cookTime} onChange={(event) => setCookTime(event.target.value)} />
          </label>
          <label>
            <span>评分（0-5）</span>
            <input max="5" min="0" type="number" value={rating} onChange={(event) => setRating(event.target.value)} />
          </label>
          <label>
            <span>适合人数</span>
            <input value={servings} onChange={(event) => setServings(event.target.value)} placeholder="例如：2人" />
          </label>
          <label className="checkbox-field">
            <input checked={favorite} type="checkbox" onChange={(event) => setFavorite(event.target.checked)} />
            <span>收藏这道菜</span>
          </label>
        </div>

        <label className="wide-field">
          <span>食材（每行一个，格式：食材 数量）</span>
          <textarea
            rows={5}
            value={ingredientsText}
            onChange={(event) => setIngredientsText(event.target.value)}
            placeholder={"鸡胸肉 300g\n青椒 2个"}
          />
        </label>

        <label className="wide-field">
          <span>步骤（每行一步）</span>
          <textarea
            rows={5}
            value={stepsText}
            onChange={(event) => setStepsText(event.target.value)}
            placeholder={"食材切好备用\n热锅下油翻炒\n调味后出锅"}
          />
        </label>

        <div className="form-grid">
          <label>
            <span>热量 kcal</span>
            <input value={calories} type="number" onChange={(event) => setCalories(event.target.value)} />
          </label>
          <label>
            <span>蛋白质 g</span>
            <input value={protein} type="number" onChange={(event) => setProtein(event.target.value)} />
          </label>
          <label>
            <span>脂肪 g</span>
            <input value={fat} type="number" onChange={(event) => setFat(event.target.value)} />
          </label>
          <label>
            <span>碳水 g</span>
            <input value={carbs} type="number" onChange={(event) => setCarbs(event.target.value)} />
          </label>
        </div>

        <label className="wide-field">
          <span>烹饪小技巧</span>
          <textarea rows={2} value={tips} onChange={(event) => setTips(event.target.value)} />
        </label>

        <label className="wide-field">
          <span>可替换食材</span>
          <textarea rows={2} value={substitutes} onChange={(event) => setSubstitutes(event.target.value)} />
        </label>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            保存菜谱
          </button>
        </div>
      </form>
    </div>
  );
}

interface AiCuisineGridProps {
  report: AiTrendReport | null;
  onAddRecipe: (dish: AiDishRecommendation) => void;
}

function AiCuisineGrid({ report, onAddRecipe }: AiCuisineGridProps) {
  return (
    <div className="ai-cuisine-grid">
      {(report?.groups ?? []).map((group) => (
        <article className="ai-cuisine-card" key={`${group.country}-${group.cuisine}`}>
          <div className="ai-cuisine-header">
            <span>{group.country}</span>
            <h3>{group.cuisine}</h3>
            <p>{group.summary}</p>
          </div>

          <div className="ai-dish-list">
            {group.dishes.map((dish) => (
              <div className="ai-dish-card" key={dish.id}>
                <div>
                  <div className="trend-card-header">
                    <h4>{dish.name}</h4>
                    <span>热度 {dish.heat}</span>
                  </div>
                  <p>{dish.reason}</p>
                  <div className="tag-row">
                    {dish.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="trend-actions">
                  {dish.sourceKeywords.slice(0, 2).map((keyword) => (
                    <a
                      href={`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`}
                      target="_blank"
                      rel="noreferrer"
                      key={keyword}
                    >
                      搜 {keyword}
                    </a>
                  ))}
                  <button className="small-primary-button" type="button" onClick={() => onAddRecipe(dish)}>
                    加入菜谱草稿
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export default App;
