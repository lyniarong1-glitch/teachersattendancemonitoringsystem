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

  const { data: mine = [] } = useQuery({
    queryKey: ["my-records", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "id, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, teachers(full_name), departments(name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Search works across every department, even before one is selected.
  const visibleTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return teachers.filter((t) => t.full_name.toLowerCase().includes(q));
    if (!departmentId) return [];
    return teachers.filter((t) => t.department_id === departmentId);
  }, [teachers, search, departmentId]);

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

  const pushToServer = useCallback(
    async (records: PendingRecord[]) => {
      const payload = records.map((r) => ({
        client_uuid: r.client_uuid,
        teacher_id: r.teacher_id,
        department_id: r.department_id,
        submitted_by: r.submitted_by,
        room_assignment: r.room_assignment,
        time_arrival: r.time_arrival,
        time_out: r.time_out,
        attendance_status: r.attendance_status,
        remarks: r.remarks,
        date_submitted: r.date_submitted,
        time_submitted: r.time_submitted,
      }));
      // Duplicate-safe: the server ignores records whose client reference already exists.
      const { error } = await supabase
        .from("attendance_records")
        .upsert(payload, { onConflict: "client_uuid", ignoreDuplicates: true });
      if (error) throw error;
    },
    [],
  );

  const syncPending = useCallback(
    async (silent = false) => {
      if (!user) return;
      const queue = loadQueue(user.id);
      if (queue.length === 0) {
        if (!silent) toast.info("Nothing to sync — all records are already submitted.");
        return;
      }
      if (!navigator.onLine) {
        if (!silent) toast.error("Still offline. Your records stay saved on this device.");
        return;
      }
      setSyncing(true);
      try {
        await pushToServer(queue);
        setPending(dequeue(user.id, queue.map((r) => r.client_uuid)));
        void queryClient.invalidateQueries({ queryKey: ["my-records"] });
        toast.success(`${queue.length} saved record${queue.length === 1 ? "" : "s"} synced`);
      } catch (e) {
        if (!silent) toast.error(`Sync failed: ${(e as Error).message}. Records are still saved locally.`);
      } finally {
        setSyncing(false);
      }
    },
    [user, pushToServer, queryClient],
  );

  // Auto-sync as soon as the connection comes back.
  useEffect(() => {
    if (online && pending.length > 0) void syncPending(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const stamp = localDateTime();
      const records: PendingRecord[] = readyRows.map((t) => {
        const r = drafts[t.department_id]![t.id]!;
        return {
          client_uuid: newClientUuid(),
          teacher_id: t.id,
          teacher_name: t.full_name,
          department_id: t.department_id,
          department_name: deptName(t.department_id),
          submitted_by: user.id,
          room_assignment: r.room_assignment,
          time_arrival: r.time_arrival || null,
          time_out: r.time_out || null,
          attendance_status: r.attendance_status as "Present" | "Late" | "Absent",
          remarks: r.remarks === "Others" ? r.other_remark.trim() || "Others" : r.remarks,
          ...stamp,
          saved_at: new Date().toISOString(),
        };
      });
      if (records.length === 0) throw new Error("No completed rows to submit");

      // Always persist locally first so nothing can be lost.
      const queue = enqueue(user.id, records);
      setPending(queue);
      // Clear only the rows that were captured into the queue, in every department.
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


      if (!navigator.onLine) return { count: records.length, offline: true };

      try {
        await pushToServer(records);
        setPending(dequeue(user.id, records.map((r) => r.client_uuid)));
        return { count: records.length, offline: false };
      } catch {
        return { count: records.length, offline: true };
      }
    },
    onSuccess: ({ count, offline }) => {
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      if (offline) {
        toast.success(
          `${count} record${count === 1 ? "" : "s"} saved on this device — they will sync when you're back online.`,
        );
      } else {
        toast.success(`${count} attendance record${count === 1 ? "" : "s"} submitted`);
      }
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
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={online ? "secondary" : "destructive"} className="gap-1">
            {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
            {online ? "Online" : "Offline mode"}
          </Badge>
          {pending.length > 0 && (
            <>
              <Badge variant="outline">
                {pending.length} record{pending.length === 1 ? "" : "s"} saved on this device
              </Badge>
              <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncPending()}>
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Record Faculty Attendance</CardTitle>
            <CardDescription>
              Pick a department, fill in the rows you observed, then submit. Entries are saved on this
              device automatically — you can work offline and switch departments without losing them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-4">
              <div className="w-full max-w-xs space-y-2">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={(v) => setDepartmentId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full max-w-xs space-y-2">
                <Label htmlFor="teacher-search">Search teacher</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="teacher-search"
                    className="pl-9"
                    placeholder="Type a teacher's name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!departmentId}
                  />
                </div>
              </div>
            </div>

            {departmentId && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[1000px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-secondary/60">
                      <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                        Teacher's Name
                      </th>
                      <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                        Room Assigned
                      </th>
                      <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                        Time In
                      </th>
                      <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                        Time Out
                      </th>
                      <th colSpan={3} className="border border-border px-3 py-2 text-center">
                        Attendance Status
                      </th>
                      <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                        Remarks
                      </th>
                    </tr>
                    <tr className="bg-secondary/60">
                      {STATUS_OPTIONS.map((s) => (
                        <th key={s} className="border border-border px-3 py-1 text-center w-12">
                          {s[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTeachers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="border border-border px-3 py-6 text-center text-muted-foreground">
                          No teacher matches “{search}”.
                        </td>
                      </tr>
                    )}
                    {visibleTeachers.map((t) => {
                      const r = rows[t.id] ?? EMPTY_ROW;
                      return (
                        <tr key={t.id} className="align-top">
                          <td className="border border-border px-3 py-2 font-medium">
                            {t.full_name}
                          </td>
                          <td className="border border-border p-1">
                            <Select
                              value={r.room_assignment}
                              onValueChange={(v) => setRow(t.id, { room_assignment: v === "__clear__" ? "" : v })}
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
                              onValueChange={(v) => setRow(t.id, { time_arrival: v === "__clear__" ? "" : v })}
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
                              onValueChange={(v) => setRow(t.id, { time_out: v === "__clear__" ? "" : v })}
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
                                  setRow(t.id, { attendance_status: c ? s : "" })
                                }
                              />
                            </td>
                          ))}
                          <td className="border border-border p-1">
                            <Select
                              value={r.remarks}
                              onValueChange={(v) => setRow(t.id, { remarks: v === "__clear__" ? "None" : v })}
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
                                onChange={(e) => setRow(t.id, { other_remark: e.target.value })}
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
            )}

            <Button
              className="w-full sm:w-auto"
              disabled={readyRows.length === 0 || submit.isPending}
              onClick={() => submit.mutate()}
            >
              <Send className="mr-2 h-4 w-4" />
              {submit.isPending
                ? "Submitting…"
                : `Submit ${readyRows.length || ""} Record${readyRows.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>

        {pending.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Saved on This Device (not yet synced)</CardTitle>
              <CardDescription>
                These records are kept exactly as you recorded them and will be sent to HR once synced.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-secondary/60">
                      <th className="border border-border px-3 py-2 text-left">Date Recorded</th>
                      <th className="border border-border px-3 py-2 text-left">Teacher's Name</th>
                      <th className="border border-border px-3 py-2 text-left">Department</th>
                      <th className="border border-border px-3 py-2 text-left">Room Assigned</th>
                      <th className="border border-border px-3 py-2 text-left">Time In</th>
                      <th className="border border-border px-3 py-2 text-left">Time Out</th>
                      <th className="border border-border px-3 py-2 text-left">Attendance Status</th>
                      <th className="border border-border px-3 py-2 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.client_uuid}>
                        <td className="border border-border px-3 py-2">
                          {r.date_submitted} {formatTime(r.time_submitted.slice(0, 5))}
                        </td>
                        <td className="border border-border px-3 py-2 font-medium">{r.teacher_name}</td>
                        <td className="border border-border px-3 py-2">{r.department_name}</td>
                        <td className="border border-border px-3 py-2">{r.room_assignment}</td>
                        <td className="border border-border px-3 py-2">{formatTime(r.time_arrival)}</td>
                        <td className="border border-border px-3 py-2">{formatTime(r.time_out)}</td>
                        <td className="border border-border px-3 py-2">
                          <Badge variant="secondary">{r.attendance_status}</Badge>
                        </td>
                        <td className="border border-border px-3 py-2">{r.remarks || "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My Recent Submissions</CardTitle>
            <CardDescription>Most recent submissions first.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-secondary/60">
                    <th className="border border-border px-3 py-2 text-left">Date Submitted</th>
                    <th className="border border-border px-3 py-2 text-left">Teacher's Name</th>
                    <th className="border border-border px-3 py-2 text-left">Department</th>
                    <th className="border border-border px-3 py-2 text-left">Room Assigned</th>
                    <th className="border border-border px-3 py-2 text-left">Time In</th>
                    <th className="border border-border px-3 py-2 text-left">Time Out</th>
                    <th className="border border-border px-3 py-2 text-left">Attendance Status</th>
                    <th className="border border-border px-3 py-2 text-left">Remarks</th>
                    <th className="border border-border px-3 py-2 text-left">Submitted By</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="border border-border px-3 py-6 text-center text-muted-foreground"
                      >
                        No records submitted yet.
                      </td>
                    </tr>
                  )}
                  {mine.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-border px-3 py-2">
                        {r.date_submitted} {formatTime(r.time_submitted?.slice(0, 5))}
                      </td>
                      <td className="border border-border px-3 py-2 font-medium">
                        {r.teachers?.full_name}
                      </td>
                      <td className="border border-border px-3 py-2">{r.departments?.name}</td>
                      <td className="border border-border px-3 py-2">{r.room_assignment}</td>
                      <td className="border border-border px-3 py-2">{formatTime(r.time_arrival)}</td>
                      <td className="border border-border px-3 py-2">{formatTime(r.time_out)}</td>
                      <td className="border border-border px-3 py-2">
                        <Badge variant="secondary">{r.attendance_status}</Badge>
                      </td>
                      <td className="border border-border px-3 py-2">{r.remarks || "None"}</td>
                      <td className="border border-border px-3 py-2">{fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
