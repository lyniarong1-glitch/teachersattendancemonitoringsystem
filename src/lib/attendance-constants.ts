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
