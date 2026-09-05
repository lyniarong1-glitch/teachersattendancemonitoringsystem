import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTime, formatTimeExact } from "@/lib/attendance-constants";

export type HistoryRecord = {
  id: string;
  room_assignment: string;
  time_arrival: string | null;
  time_out: string | null;
  attendance_status: "Present" | "Late" | "Absent";
  remarks: string | null;
  date_submitted: string;
  time_submitted: string;
  last_edited_at: string | null;
  departments: { name: string } | null;
  profiles: { full_name: string } | null;
};

const ROWS_PER_PAGE = 10;

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function statusVariant(s: HistoryRecord["attendance_status"]) {
  return s === "Present" ? "default" : s === "Late" ? "secondary" : "destructive";
}

export function TeacherAttendanceHistory({
  records,
  onEdit,
}: {
  records: HistoryRecord[];
  onEdit?: (r: HistoryRecord) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  // Summary always reflects every stored record for this teacher.
  const summary = useMemo(() => {
    let present = 0,
      late = 0,
      absent = 0;
    for (const r of records) {
      if (r.attendance_status === "Present") present++;
      else if (r.attendance_status === "Late") late++;
      else absent++;
    }
    return { present, late, absent, total: records.length };
  }, [records]);

  const recordedDays = useMemo(
    () => [...new Set(records.map((r) => r.date_submitted))].map(fromKey),
    [records],
  );

  const chronological = useMemo(
    () =>
      [...records].sort((a, b) =>
        `${b.date_submitted} ${b.time_submitted}`.localeCompare(
          `${a.date_submitted} ${a.time_submitted}`,
        ),
      ),
    [records],
  );

  const visibleByDate = useMemo(() => {
    if (!selectedDate) return chronological;
    const key = toKey(selectedDate);
    return chronological.filter((r) => r.date_submitted === key);
  }, [chronological, selectedDate]);

  const pageCount = Math.max(1, Math.ceil(visibleByDate.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = visibleByDate.slice(safePage * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE + ROWS_PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Present", value: summary.present },
          { label: "Total Late", value: summary.late },
          { label: "Total Absent", value: summary.absent },
          { label: "Total Records", value: summary.total },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-secondary/40 p-3 text-center">
            <div className="text-2xl font-extrabold">{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Review by date
            </span>
            {selectedDate && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedDate(undefined);
                  setPage(0);
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              setSelectedDate(d);
              setPage(0);
            }}
            modifiers={{ recorded: recordedDays }}
            modifiersClassNames={{
              recorded: "font-extrabold text-primary underline underline-offset-4",
            }}
          />
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Underlined dates have attendance records.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing {rows.length} of {visibleByDate.length} record
            {visibleByDate.length === 1 ? "" : "s"}
            {selectedDate ? ` on ${toKey(selectedDate)}` : ""} — most recent first.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time Submitted</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Time Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Submitted By</TableHead>
                  {onEdit && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={onEdit ? 10 : 9} className="text-center text-muted-foreground">
                      No records for this selection.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date_submitted}</TableCell>
                    <TableCell>{formatTimeExact(r.time_submitted)}</TableCell>
                    <TableCell>{r.departments?.name}</TableCell>
                    <TableCell>{r.room_assignment}</TableCell>
                    <TableCell>{formatTime(r.time_arrival)}</TableCell>
                    <TableCell>{formatTime(r.time_out)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.attendance_status)}>{r.attendance_status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.remarks || "None"}
                      {r.last_edited_at && (
                        <div className="text-xs text-muted-foreground">
                          edited {new Date(r.last_edited_at).toLocaleString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{r.profiles?.full_name ?? "—"}</TableCell>
                    {onEdit && (
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {visibleByDate.length > ROWS_PER_PAGE && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-sm font-medium text-muted-foreground">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
