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
  "A-201", "A-202", "A-203", "A-204", "A-205", "A-206",
  "B-101", "B-102", "B-103", "B-104", "B-105",
  "C-201", "C-202", "C-203", "C-204",
  "D-301", "D-302", "D-303", "D-304",
  "E-101", "E-102", "E-103",
  "F-201", "F-202", "F-203",
  "G-301", "G-302",
  "HME Function Hall", "HME Kitchen Lab", "HME Bar Lab", "HME Hotel Room Lab",
  "ITE Computer Lab 1", "ITE Computer Lab 2", "ITE Computer Lab 3",
  "CRIM Crime Lab", "CRIM Moot Court",
  "Speech Laboratory", "Science Laboratory", "Library Annex",
  "Gymnasium", "AVR Hall",
  "SA-405", "SA-406",
];

export const REMARKS_OPTIONS = [
  "None",
  "On Leave",
  "Seminar",
  "No Class",
  "Class Rescheduled",
  "Other",
];

export const STATUS_OPTIONS = ["Present", "Late", "Absent"] as const;
