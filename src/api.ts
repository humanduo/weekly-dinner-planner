import type { AiTrendReport, AppState } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAppState(): Promise<AppState> {
  return request<AppState>("/api/state");
}

export async function saveAppState(state: AppState): Promise<AppState> {
  return request<AppState>("/api/state", {
    method: "PUT",
    body: JSON.stringify(state),
  });
}

export async function fetchAiTrends(): Promise<AiTrendReport> {
  return request<AiTrendReport>("/api/ai-trends");
}

export async function refreshAiTrends(): Promise<AiTrendReport> {
  return request<AiTrendReport>("/api/ai-trends/refresh", {
    method: "POST",
  });
}

export async function searchAiIngredientTrends(ingredient: string): Promise<AiTrendReport> {
  return request<AiTrendReport>("/api/ai-trends/ingredient", {
    method: "POST",
    body: JSON.stringify({ ingredient }),
  });
}
