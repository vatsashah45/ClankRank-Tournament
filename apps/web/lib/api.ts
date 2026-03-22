const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new ApiError(res.status, text || "Request failed");
    return text as unknown as T;
  }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? String((data as Record<string, unknown>).error)
      : "Request failed";
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: "no-store" });
  return handleResponse<T>(res);
}

export interface EntryRecord {
  id: number;
  agentId: string;
  walletAddress: string;
  chain: "monad" | "ethereum" | "arbitrum" | "base";
  authorizedFeedback: boolean;
  createdAt: string;
  status: "registered" | "qualified" | "eliminated" | "active" | "champion";
  score?: number;
  tier?: string;
}

/** Fetch entries from /api/entries, handling both wrapped and raw array responses. */
export async function getEntries(): Promise<EntryRecord[]> {
  const data = await apiGet<unknown>("/entries");
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "entries" in data && Array.isArray((data as Record<string, unknown>).entries)) {
    return (data as { entries: EntryRecord[] }).entries;
  }
  return [];
}

// Admin API helpers — include x-admin-key from cookie
function getAdminKey(): string {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/admin-token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return "";
}

export async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    cache: "no-store",
    headers: { "x-admin-key": getAdminKey() },
  });
  return handleResponse<T>(res);
}

export async function adminPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": getAdminKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}
