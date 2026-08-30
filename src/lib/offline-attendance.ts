/**
 * Offline support for the Student Assistant attendance page.
 * Everything is stored in localStorage so the SA can keep recording without internet.
 * The network is only needed to log in and to push queued batches to HR.
 */

export type OfflineRecord = {
  date_submitted: string;
  time_submitted: string;
  teacher_id: string;
  department_id: string;
  submitted_by: string;
  room_assignment: string;
  time_arrival: string | null;
  time_out: string | null;
  attendance_status: "Present" | "Late" | "Absent";
  remarks: string;
};

export type OfflineNotification = {
  submitted_by: string;
  submitted_by_name: string;
  department_id: string | null;
  department_name: string | null;
  record_count: number;
};

export type PendingBatch = {
  id: string;
  created_at: number;
  records: OfflineRecord[];
  notification: OfflineNotification;
};

const DRAFT_KEY = "tams.sa.draft";
const QUEUE_KEY = "tams.sa.queue";
const ROSTER_KEY = "tams.sa.roster";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

/* ---------- in-progress rows (draft) ---------- */

export function loadDraft<T>(): T | null {
  return read<T | null>(DRAFT_KEY, null);
}

export function saveDraft(rows: unknown) {
  write(DRAFT_KEY, rows);
}

export function clearDraft() {
  if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
}

/* ---------- cached roster (departments + teachers) ---------- */

export type CachedRoster = {
  departments: { id: string; name: string }[];
  teachers: { id: string; full_name: string; department_id: string }[];
};

export function loadRoster(): CachedRoster | null {
  return read<CachedRoster | null>(ROSTER_KEY, null);
}

export function saveRoster(roster: Partial<CachedRoster>) {
  const current = loadRoster() ?? { departments: [], teachers: [] };
  write(ROSTER_KEY, { ...current, ...roster });
}

/* ---------- pending submission queue ---------- */

export function loadQueue(): PendingBatch[] {
  return read<PendingBatch[]>(QUEUE_KEY, []);
}

export function enqueueBatch(batch: Omit<PendingBatch, "id" | "created_at">): PendingBatch {
  const entry: PendingBatch = {
    ...batch,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: Date.now(),
  };
  write(QUEUE_KEY, [...loadQueue(), entry]);
  return entry;
}

export function removeFromQueue(id: string) {
  write(
    QUEUE_KEY,
    loadQueue().filter((b) => b.id !== id),
  );
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
