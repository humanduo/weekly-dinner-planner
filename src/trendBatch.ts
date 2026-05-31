import type { TrendingDish } from "./types";

function hashText(value: string) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function rotate<T>(items: T[], offset: number) {
  if (items.length === 0) {
    return [];
  }

  const safeOffset = offset % items.length;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
}

export function buildTrendingDishBatch(
  dishes: TrendingDish[],
  weekStart: string,
  refreshSeed: number,
  likedCreators: string[],
  batchSize = 6,
) {
  const likedSet = new Set(likedCreators);
  const weeklyDeck = [...dishes].sort(
    (a, b) =>
      hashText(`${weekStart}:${a.id}`) - hashText(`${weekStart}:${b.id}`) ||
      b.heat - a.heat ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
  const likedDeck = weeklyDeck.filter((dish) => likedSet.has(dish.creator));
  const regularDeck = weeklyDeck.filter((dish) => !likedSet.has(dish.creator));
  const likedCreatorCount = new Set(likedDeck.map((dish) => dish.creator)).size;
  const likedSlots = Math.min(likedCreatorCount, 2, batchSize);
  const selected: TrendingDish[] = [];
  const selectedIds = new Set<string>();

  function addDish(dish: TrendingDish) {
    if (selected.length >= batchSize || selectedIds.has(dish.id)) {
      return;
    }

    selected.push(dish);
    selectedIds.add(dish.id);
  }

  rotate(likedDeck, refreshSeed * Math.max(likedSlots, 1))
    .slice(0, likedSlots)
    .forEach(addDish);

  for (const dish of rotate(regularDeck, refreshSeed * Math.max(batchSize - likedSlots, 1))) {
    addDish(dish);
  }

  for (const dish of rotate(weeklyDeck, refreshSeed * batchSize)) {
    addDish(dish);
  }

  return selected;
}
