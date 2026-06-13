/**
 * auth.ts — Client manager for user sessions and profile sync with fallback to localStorage.
 */

import { LessPassProfile } from "./lesspass";

export interface User {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
}

export interface SavedProfile extends LessPassProfile {
  id?: string | number; // Server ID or local timestamp
  profileName: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  serverUrl: string;
}

const SESSION_KEY = "statepass_session";
const LOCAL_PROFILES_KEY = "statepass_local_profiles";
export const DEFAULT_SERVER_URL = "http://localhost:4000";

// Helper: safe localStorage access for SSR/Next.js hydration
function isClient() {
  return typeof window !== "undefined";
}

export function getStoredSession(): Session | null {
  if (!isClient()) return null;
  const s = localStorage.getItem(SESSION_KEY);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function storeSession(session: Session) {
  if (!isClient()) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (!isClient()) return;
  localStorage.removeItem(SESSION_KEY);
}

// Fallback Local Profiles
export function getLocalProfiles(): SavedProfile[] {
  if (!isClient()) return [];
  const p = localStorage.getItem(LOCAL_PROFILES_KEY);
  if (!p) return [];
  try {
    return JSON.parse(p);
  } catch {
    return [];
  }
}

export function saveLocalProfile(profile: SavedProfile) {
  if (!isClient()) return;
  const list = getLocalProfiles();
  // Avoid duplicate by profileName
  const index = list.findIndex((item) => item.profileName === profile.profileName);
  const updatedProfile = { ...profile, id: profile.id || Date.now().toString() };
  if (index >= 0) {
    list[index] = updatedProfile;
  } else {
    list.push(updatedProfile);
  }
  localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(list));
  return list;
}

export function deleteLocalProfile(profileName: string) {
  if (!isClient()) return;
  const list = getLocalProfiles().filter((item) => item.profileName !== profileName);
  localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(list));
  return list;
}

// ─── API Requests ─────────────────────────────────────────────────────────────

async function apiRequest(
  url: string,
  method: string,
  body: any,
  accessToken?: string
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "API returned invalid response" };
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  return data;
}

export async function apiRegister(serverUrl: string, fields: any) {
  const cleanUrl = `${serverUrl.replace(/\/$/, "")}/api/auth/register`;
  return apiRequest(cleanUrl, "POST", fields);
}

export async function apiLogin(serverUrl: string, fields: any): Promise<Session> {
  const cleanUrl = `${serverUrl.replace(/\/$/, "")}/api/auth/login`;
  const res = await apiRequest(cleanUrl, "POST", fields);
  const session: Session = {
    user: res.user,
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    serverUrl,
  };
  storeSession(session);
  return session;
}

export async function apiLogout(session: Session) {
  const cleanUrl = `${session.serverUrl.replace(/\/$/, "")}/api/auth/logout`;
  try {
    await apiRequest(cleanUrl, "POST", { refreshToken: session.refreshToken }, session.accessToken);
  } catch (err) {
    console.warn("Server logout failed", err);
  }
  clearSession();
}

export async function apiGetProfiles(session: Session): Promise<SavedProfile[]> {
  const cleanUrl = `${session.serverUrl.replace(/\/$/, "")}/api/profiles`;
  const res = await apiRequest(cleanUrl, "GET", null, session.accessToken);
  return res.profiles || [];
}

export async function apiSyncProfiles(session: Session, profiles: SavedProfile[]): Promise<any> {
  const cleanUrl = `${session.serverUrl.replace(/\/$/, "")}/api/profiles/sync`;
  return apiRequest(cleanUrl, "POST", { profiles }, session.accessToken);
}
