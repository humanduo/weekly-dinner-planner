import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { isDatabaseEnabled, queryDb } from "./database";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "weekly_dinner_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
const authFile = join(dataDir, "auth.json");

export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

interface StoredUser extends AuthUser {
  usernameKey: string;
  passwordHash: string;
  passwordSalt: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

interface AuthFileState {
  users: StoredUser[];
  sessions: StoredSession[];
}

export type AuthenticatedRequest = Request & { user: AuthUser };

function normalizeUsername(username: string) {
  return username.trim();
}

function usernameKey(username: string) {
  return normalizeUsername(username).toLocaleLowerCase("zh-CN");
}

function validateCredentials(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.length < 2 || normalizedUsername.length > 32) {
    throw new Error("账号名需要 2-32 个字符。");
  }

  if (!/^[\p{L}\p{N}_@.-]+$/u.test(normalizedUsername)) {
    throw new Error("账号名只能包含文字、数字、下划线、点、横线或 @。");
  }

  if (password.length < 6 || password.length > 128) {
    throw new Error("密码需要至少 6 位。");
  }

  return normalizedUsername;
}

async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return { hash: hash.toString("hex"), salt };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function publicUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  };
}

async function ensureAuthTables() {
  if (!isDatabaseEnabled()) {
    return;
  }

  await queryDb(`
    CREATE TABLE IF NOT EXISTS app_users (
      id text PRIMARY KEY,
      username text NOT NULL,
      username_key text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      password_salt text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await queryDb("CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id)");
  await queryDb("DELETE FROM app_sessions WHERE expires_at <= now()");
}

async function readAuthFile(): Promise<AuthFileState> {
  if (!existsSync(authFile)) {
    return { users: [], sessions: [] };
  }

  return JSON.parse(await readFile(authFile, "utf-8")) as AuthFileState;
}

async function writeAuthFile(state: AuthFileState) {
  await mkdir(dirname(authFile), { recursive: true });
  await writeFile(authFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function createUser(username: string, password: string): Promise<AuthUser> {
  const normalizedUsername = validateCredentials(username, password);
  const key = usernameKey(normalizedUsername);
  const { hash, salt } = await hashPassword(password);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    username: normalizedUsername,
    usernameKey: key,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
  };

  if (isDatabaseEnabled()) {
    await ensureAuthTables();
    try {
      await queryDb(
        `
          INSERT INTO app_users (id, username, username_key, password_hash, password_salt, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [user.id, user.username, user.usernameKey, user.passwordHash, user.passwordSalt, user.createdAt],
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new Error("这个账号名已经被注册。");
      }
      throw error;
    }
    return publicUser(user);
  }

  const state = await readAuthFile();
  if (state.users.some((item) => item.usernameKey === key)) {
    throw new Error("这个账号名已经被注册。");
  }
  state.users.push(user);
  await writeAuthFile(state);
  return publicUser(user);
}

async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const key = usernameKey(username);
  if (isDatabaseEnabled()) {
    await ensureAuthTables();
    const result = await queryDb<{
      id: string;
      username: string;
      username_key: string;
      password_hash: string;
      password_salt: string;
      created_at: string;
    }>("SELECT * FROM app_users WHERE username_key = $1", [key]);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          username: row.username,
          usernameKey: row.username_key,
          passwordHash: row.password_hash,
          passwordSalt: row.password_salt,
          createdAt: new Date(row.created_at).toISOString(),
        }
      : null;
  }

  const state = await readAuthFile();
  return state.users.find((item) => item.usernameKey === key) ?? null;
}

async function createSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const createdAt = new Date().toISOString();

  if (isDatabaseEnabled()) {
    await ensureAuthTables();
    await queryDb(
      `
        INSERT INTO app_sessions (token_hash, user_id, expires_at, created_at)
        VALUES ($1, $2, $3, $4)
      `,
      [tokenHash, userId, expiresAt, createdAt],
    );
    return token;
  }

  const state = await readAuthFile();
  state.sessions = state.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  state.sessions.push({ tokenHash, userId, expiresAt, createdAt });
  await writeAuthFile(state);
  return token;
}

async function findUserBySessionToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashToken(token);
  if (isDatabaseEnabled()) {
    await ensureAuthTables();
    const result = await queryDb<{
      id: string;
      username: string;
      created_at: string;
    }>(
      `
        SELECT app_users.id, app_users.username, app_users.created_at
        FROM app_sessions
        JOIN app_users ON app_users.id = app_sessions.user_id
        WHERE app_sessions.token_hash = $1 AND app_sessions.expires_at > now()
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          username: row.username,
          createdAt: new Date(row.created_at).toISOString(),
        }
      : null;
  }

  const state = await readAuthFile();
  const session = state.sessions.find(
    (item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now(),
  );
  const user = session ? state.users.find((item) => item.id === session.userId) : null;
  return user ? publicUser(user) : null;
}

async function deleteSession(token: string) {
  const tokenHash = hashToken(token);
  if (isDatabaseEnabled()) {
    await ensureAuthTables();
    await queryDb("DELETE FROM app_sessions WHERE token_hash = $1", [tokenHash]);
    return;
  }

  const state = await readAuthFile();
  state.sessions = state.sessions.filter((item) => item.tokenHash !== tokenHash);
  await writeAuthFile(state);
}

function getCookie(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [rawKey, ...valueParts] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

function clearSessionCookie(response: Response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  return token ? findUserBySessionToken(token) : null;
}

export async function registerWithPassword(username: string, password: string) {
  const user = await createUser(username, password);
  const token = await createSession(user.id);
  return { user, token };
}

export async function loginWithPassword(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    throw new Error("账号或密码不正确。");
  }

  const token = await createSession(user.id);
  return { user: publicUser(user), token };
}

export async function logoutRequest(request: Request, response: Response) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await deleteSession(token);
  }
  clearSessionCookie(response);
}

export function attachSession(response: Response, token: string) {
  setSessionCookie(response, token);
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const user = await getRequestUser(request);
  if (!user) {
    response.status(401).json({ error: "请先登录。" });
    return;
  }

  (request as AuthenticatedRequest).user = user;
  next();
}
