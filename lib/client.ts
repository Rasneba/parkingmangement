"use client";

import { isPublicKioskPath } from "@/lib/public-kiosk";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  company_id: number;
  company_name: string;
  company_tin: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

let kioskToken: string | null = null;
let kioskTokenPromise: Promise<string | null> | null = null;

async function getKioskToken(): Promise<string | null> {
  if (kioskToken) return kioskToken;
  if (!kioskTokenPromise) {
    kioskTokenPromise = fetch("/api/auth/kiosk", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { token?: string };
        kioskToken = data.token ?? null;
        return kioskToken;
      })
      .catch(() => null)
      .finally(() => {
        kioskTokenPromise = null;
      });
  }
  return kioskTokenPromise;
}

function onPublicKioskPath(): boolean {
  return typeof window !== "undefined" && isPublicKioskPath(window.location.pathname);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function doFetch(path: string, options: RequestInit, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const publicPath = onPublicKioskPath();
  let token = getToken();
  if (!token && publicPath) token = await getKioskToken();

  let res = await doFetch(path, options, token);

  // A kiosk tab can stay open for days. If its token expires (or a stale
  // staff token is present), discard it and retry once with a fresh token.
  if (res.status === 401 && publicPath) {
    clearSession();
    kioskToken = null;
    token = await getKioskToken();
    if (token) res = await doFetch(path, options, token);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError(`Unexpected response (${res.status})`, res.status);
    }
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !publicPath) {
      clearSession();
      window.location.replace("/login");
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const apiGet = <T = any>(path: string) => apiFetch<T>(path);
export const apiPost = <T = any>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T = any>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiDelete = <T = any>(path: string) => apiFetch<T>(path, { method: "DELETE" });
