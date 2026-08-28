export const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = [];
  for (let m = 7 * 60; m <= 21 * 60; m += 30) {
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 < 12 ? "AM" : "PM";
    slots.push({
      value: `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      label: `${h12}:${String(min).padStart(2, "0")} ${suffix}`,
    });
  }
  return slots;
})();

export function formatTime(value?: string | null) {
  if (!value) return "—";
  const [h, m] = value.split(":");
  const h24 = Number(h);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${h24 < 12 ? "AM" : "PM"}`;
}

export const ROOMS = [
  "A-201", "A-202",
  "F-102", "F-103", "F-301", "F-302", "F-303",
  "Mini Hotel",
  "Chemistry Laboratory",
  "Biological Science Laboratory",
  "Upper Canteen A", "Upper Canteen B",
  "Cold Kitchen", "Hot Kitchen 1", "Hot Kitchen 2",
  "SA-105",
  "SA-201", "SA-202", "SA-203", "SA-204", "SA-205",
  "SA-206", "SA-207", "SA-208", "SA-209", "SA-210",
  "SA-301", "SA-302", "SA-303", "SA-304", "SA-305", "SA-306",
  "SA-307", "SA-308", "SA-309", "SA-310", "SA-311",
  "SA-401", "SA-402", "SA-403", "SA-404", "SA-405", "SA-406",
];

export const REMARKS_OPTIONS = [
  "None",
  "On Leave",
  "Seminar",
  "No Class",
  "Class Rescheduled",
  "Others",
];

export const STATUS_OPTIONS = ["Present", "Late", "Absent"] as const;

export const CLASS_SCHEDULES: string[] = [
  "Morning Session",
  "Afternoon Session",
  "Evening Session",
];

/** Exact local clock time (with seconds) — e.g. 2:07:35 PM */
export function formatTimeExact(value?: string | null) {
  if (!value) return "—";
  const [h, m, s] = value.split(":");
  const h24 = Number(h);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m}:${(s ?? "00").slice(0, 2)} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Local date (YYYY-MM-DD) and time (HH:MM:SS) captured on the submitting device. */
export function localSubmissionStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date_submitted: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time_submitted: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

/** Readable full date, e.g. Friday, August 28, 2026 */
export function formatDateLong(value?: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
