/**
 * Offline support for the Student Assistant attendance module.
 * Rosters are cached and submitted batches are queued in localStorage,
 * then pushed to the database as soon as the device is back online.
 */

export type PendingRecord = {
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

export type PendingNotification = {
  submitted_by: string;
  submitted_by_name: string;
  department_id: string | null;
  department_name: string | null;
  record_count: number;
};

export type PendingBatch = {
  id: string;
  created_at: string;
  records: PendingRecord[];
  notification: PendingNotification;
};

export type CachedRoster = {
  departments: { id: string; name: string }[];
  teachers: { id: string; full_name: string; department_id: string; is_active: boolean }[];
};

const QUEUE_KEY = "tams.offline.queue.v1";
const ROSTER_KEY = "tams.offline.roster.v1";

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
    /* storage full or unavailable — ignore */
  }
}

export function getPendingBatches(): PendingBatch[] {
  return read<PendingBatch[]>(QUEUE_KEY, []);
}

export function queueBatch(batch: Omit<PendingBatch, "id" | "created_at">): PendingBatch {
  const entry: PendingBatch = {
    ...batch,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  write(QUEUE_KEY, [...getPendingBatches(), entry]);
  return entry;
}

export function removeBatch(id: string) {
  write(
    QUEUE_KEY,
    getPendingBatches().filter((b) => b.id !== id),
  );
}

export function pendingRecordCount() {
  return getPendingBatches().reduce((n, b) => n + b.records.length, 0);
}

export function cacheRoster(partial: Partial<CachedRoster>) {
  const current = getCachedRoster();
  write(ROSTER_KEY, { ...current, ...partial });
}

export function getCachedRoster(): CachedRoster {
  return read<CachedRoster>(ROSTER_KEY, { departments: [], teachers: [] });
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
