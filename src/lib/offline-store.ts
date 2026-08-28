// Local-first storage helpers for the Student Assistant module.
// All reads/writes are browser-only and guarded for SSR.

export type OfflineRow = {
  room_assignment: string;
  time_arrival: string;
  time_out: string;
  attendance_status: string;
  remarks: string;
  other_remark: string;
};

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

function read<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — keep the in-memory state working */
  }
}

/* ---------- cached reference data (teacher + department lists) ---------- */

export function cacheGet<T>(key: string): T | null {
  return read<T | null>(`tams:cache:${key}`, null);
}

export function cacheSet(key: string, value: unknown) {
  write(`tams:cache:${key}`, value);
}

/* ---------- per-department attendance drafts ---------- */

export type DraftsByDepartment = Record<string, Record<string, OfflineRow>>;

const draftsKey = (userId: string) => `tams:drafts:${userId}`;

export function loadDrafts(userId: string): DraftsByDepartment {
  return read<DraftsByDepartment>(draftsKey(userId), {});
}

export function saveDrafts(userId: string, drafts: DraftsByDepartment) {
  write(draftsKey(userId), drafts);
}

export function newClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function localDateTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date_submitted: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time_submitted: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}
