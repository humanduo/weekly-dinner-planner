import type { AiTrendReport, AppState } from "./types";

export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const result = await request<{ user: AuthUser | null }>("/api/auth/me");
  return result.user;
}

export async function registerAccount(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return result.user;
}

export async function loginAccount(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return result.user;
}

export async function logoutAccount(): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
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
