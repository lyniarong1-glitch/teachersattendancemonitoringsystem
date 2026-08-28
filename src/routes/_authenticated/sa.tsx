import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw, Search, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROOMS,
  REMARKS_OPTIONS,
  STATUS_OPTIONS,
  TIME_SLOTS,
  formatTime,
} from "@/lib/attendance-constants";
import {
  cacheGet,
  cacheSet,
  dequeue,
  enqueue,
  loadDrafts,
  loadQueue,
  localDateTime,
  newClientUuid,
  saveDrafts,
  type DraftsByDepartment,
  type OfflineRow,
  type PendingRecord,
} from "@/lib/offline-store";

export const Route = createFileRoute("/_authenticated/sa")({
  head: () => ({
    meta: [
      { title: "Record Attendance — Student Assistant Module" },
      {
        name: "description",
        content:
          "Log room assignment, time in, time out, attendance status and remarks for every teacher in a department roster sheet — online or offline.",
      },
      { property: "og:title", content: "Student Assistant Attendance Entry" },
      {
        property: "og:description",
        content: "Record faculty attendance offline and sync it to the HR master table when back online.",
      },
    ],
  }),
  component: SAModule,
});

type RowState = OfflineRow;

const EMPTY_ROW: RowState = {
  room_assignment: "",
  time_arrival: "",
  time_out: "",
  attendance_status: "",
  remarks: "None",
  other_remark: "",
};

type Dept = { id: string; name: string };
type Teacher = { id: string; full_name: string; department_id: string };


function SAModule() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<DraftsByDepartment>({});
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  const getRow = (t: Teacher): RowState => drafts[t.department_id]?.[t.id] ?? EMPTY_ROW;

  // Load locally-saved drafts + pending queue once the user is known.
  useEffect(() => {
    if (!user || hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;
    setDrafts(loadDrafts(user.id));
    setPending(loadQueue(user.id));
  }, [user]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const setRow = (deptId: string, id: string, patch: Partial<RowState>) => {
    if (!deptId) return;
    setDrafts((prev) => {
      const dept = { ...(prev[deptId] ?? {}) };
      dept[id] = { ...EMPTY_ROW, ...dept[id], ...patch };
      const next = { ...prev, [deptId]: dept };
      if (user) saveDrafts(user.id, next);
      return next;
    });
  };


  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("departments").select("id, name").order("name");
        if (error) throw error;
        cacheSet("departments", data);
        return data as Dept[];
      } catch (e) {
        const cached = cacheGet<Dept[]>("departments");
        if (cached) return cached;
        throw e;
      }
    },
    initialData: () => cacheGet<Dept[]>("departments") ?? undefined,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers", "all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("teachers")
          .select("id, full_name, department_id")
          .order("full_name");
        if (error) throw error;
        cacheSet("teachers:all", data);
        return data as Teacher[];
      } catch (e) {
        const cached = cacheGet<Teacher[]>("teachers:all");
        if (cached) return cached;
        throw e;
      }
    },
    initialData: () => cacheGet<Teacher[]>("teachers:all") ?? undefined,
  });




  // Search works across every department, even before one is selected.
  const visibleTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return teachers.filter((t) => t.full_name.toLowerCase().includes(q));
    if (!departmentId) return teachers;
    return teachers.filter((t) => t.department_id === departmentId);
  }, [teachers, search, departmentId]);

  // Grouped by department so the sheet mirrors the printed roster format.
  const teacherGroups = useMemo(() => {
    const map = new Map<string, Teacher[]>();
    for (const t of visibleTeachers) {
      const list = map.get(t.department_id);
      if (list) list.push(t);
      else map.set(t.department_id, [t]);
    }
    return [...map.entries()];
  }, [visibleTeachers]);


  const isComplete = (r?: RowState) => {
    if (!r) return false;
    if (!r.room_assignment || !r.attendance_status) return false;
    if (r.attendance_status !== "Absent" && (!r.time_arrival || !r.time_out)) return false;
    return true;
  };

  // Ready rows are computed from every department's saved drafts, never from the
  // search view, so filtering or switching departments can never drop a record.
  const readyRows = useMemo(
    () => teachers.filter((t) => isComplete(drafts[t.department_id]?.[t.id])),
    [teachers, drafts],
  );


  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "";



  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const stamp = localDateTime();
      const records = readyRows.map((t) => {
        const r = drafts[t.department_id]![t.id]!;
        return {
          client_uuid: newClientUuid(),
          teacher_id: t.id,
          department_id: t.department_id,
          submitted_by: user.id,
          room_assignment: r.room_assignment,
          time_arrival: r.time_arrival || null,
          time_out: r.time_out || null,
          attendance_status: r.attendance_status as "Present" | "Late" | "Absent",
          remarks: r.remarks === "Others" ? r.other_remark.trim() || "Others" : r.remarks,
          ...stamp,
        };
      });
      if (records.length === 0) throw new Error("No completed rows to submit");

      // Duplicate-safe: the server ignores records whose client reference already exists.
      const { error } = await supabase
        .from("attendance_records")
        .upsert(records, { onConflict: "client_uuid", ignoreDuplicates: true });
      if (error) throw error;

      // Clear only the rows that were successfully submitted, in every department.
      setDrafts((prev) => {
        const next: DraftsByDepartment = { ...prev };
        for (const r of records) {
          const dept = { ...(next[r.department_id] ?? {}) };
          delete dept[r.teacher_id];
          next[r.department_id] = dept;
        }
        saveDrafts(user.id, next);
        return next;
      });

      return { count: records.length };
    },
    onSuccess: ({ count }) => {
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      toast.success(`${count} attendance record${count === 1 ? "" : "s"} submitted to HR`);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (role && role !== "student_assistant") {
    return (
      <div className="min-h-screen">
        <AppHeader name={fullName} role="HR" />
        <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
          This module is only available to Student Assistant accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Student Assistant" userId={user?.id} isSA />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Record Faculty Attendance</CardTitle>
            <CardDescription>
              Completed rows are submitted straight to HR exactly as you recorded them.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3 rounded-md border-2 border-foreground px-3 py-2">
                <Label className="whitespace-nowrap uppercase">Select Department:</Label>
                <Select value={departmentId} onValueChange={(v) => setDepartmentId(v)}>
                  <SelectTrigger className="h-9 w-48 border-0 shadow-none focus:ring-0">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 rounded-md border-2 border-foreground px-3 py-2">
                <Label htmlFor="teacher-search" className="whitespace-nowrap uppercase">
                  Search Teachers Name:
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="teacher-search"
                    className="h-9 w-48 border-0 pl-8 shadow-none focus-visible:ring-0"
                    placeholder="Type a teacher's name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {teacherGroups.length === 0 && (
              <p className="text-muted-foreground">No teacher matches “{search}”.</p>
            )}


            {teacherGroups.map(([deptId, group]) => (
              <section key={deptId} className="space-y-2">
                <h2 className="text-base font-bold uppercase tracking-wide">{deptName(deptId)}</h2>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[1000px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-secondary/60">
                        <th rowSpan={2} className="border border-border px-3 py-2 text-center">
                          TEACHERS NAME
                        </th>
                        <th rowSpan={2} className="border border-border px-3 py-2 text-center">
                          ROOM ASSIGNED
                        </th>
                        <th rowSpan={2} className="border border-border px-3 py-2 text-center">
                          TIME IN
                        </th>
                        <th rowSpan={2} className="border border-border px-3 py-2 text-center">
                          TIME OUT
                        </th>
                        <th colSpan={3} className="border border-border px-3 py-2 text-center">
                          ATTENDANCE STATUS
                        </th>
                        <th rowSpan={2} className="border border-border px-3 py-2 text-center">
                          REMARKS
                        </th>
                      </tr>
                      <tr className="bg-secondary/60">
                        {STATUS_OPTIONS.map((s) => (
                          <th key={s} className="w-12 border border-border px-3 py-1 text-center">
                            {s[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((t) => {
                        const r = getRow(t);
                        return (
                          <tr key={t.id} className="align-top">
                            <td className="border border-border px-3 py-2 font-medium">
                              {t.full_name}
                            </td>
                            <td className="border border-border p-1">
                              <Select
                                value={r.room_assignment}
                                onValueChange={(v) => setRow(t.department_id, t.id, { room_assignment: v === "__clear__" ? "" : v })}
                              >
                                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Room" /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__clear__">Clear selection</SelectItem>
                                  {ROOMS.map((room) => (
                                    <SelectItem key={room} value={room}>{room}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="border border-border p-1">
                              <Select
                                value={r.time_arrival}
                                onValueChange={(v) => setRow(t.department_id, t.id, { time_arrival: v === "__clear__" ? "" : v })}
                              >
                                <SelectTrigger className="h-9 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__clear__">Clear</SelectItem>
                                  {TIME_SLOTS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="border border-border p-1">
                              <Select
                                value={r.time_out}
                                onValueChange={(v) => setRow(t.department_id, t.id, { time_out: v === "__clear__" ? "" : v })}
                              >
                                <SelectTrigger className="h-9 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__clear__">Clear</SelectItem>
                                  {TIME_SLOTS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            {STATUS_OPTIONS.map((s) => (
                              <td key={s} className="border border-border p-1 text-center">
                                <Checkbox
                                  aria-label={`${s} — ${t.full_name}`}
                                  checked={r.attendance_status === s}
                                  onCheckedChange={(c) =>
                                    setRow(t.department_id, t.id, { attendance_status: c ? s : "" })
                                  }
                                />
                              </td>
                            ))}
                            <td className="border border-border p-1">
                              <Select
                                value={r.remarks}
                                onValueChange={(v) => setRow(t.department_id, t.id, { remarks: v === "__clear__" ? "None" : v })}
                              >
                                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Remarks" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__clear__">Clear selection</SelectItem>
                                  {REMARKS_OPTIONS.map((o) => (
                                    <SelectItem key={o} value={o}>{o}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {r.remarks === "Others" && (
                                <Input
                                  className="mt-1 h-9 w-44"
                                  maxLength={200}
                                  value={r.other_remark}
                                  onChange={(e) => setRow(t.department_id, t.id, { other_remark: e.target.value })}
                                  placeholder="Specify remark"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}


            <div className="flex justify-start pt-2">
              <Button
                className="min-w-32"
                disabled={readyRows.length === 0 || submit.isPending}
                onClick={() => submit.mutate()}
              >
                <Send className="mr-2 h-4 w-4" />
                {submit.isPending
                  ? "Submitting…"
                  : `Submit ${readyRows.length || ""} Record${readyRows.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardContent>
        </Card>






      </main>
    </div>
  );
}
