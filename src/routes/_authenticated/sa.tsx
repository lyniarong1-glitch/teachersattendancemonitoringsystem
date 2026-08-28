import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
  localSubmissionStamp,
} from "@/lib/attendance-constants";

export const Route = createFileRoute("/_authenticated/sa")({
  head: () => ({
    meta: [
      { title: "Record Attendance — Student Assistant Module" },
      {
        name: "description",
        content:
          "Log room assignment, time in, time out, attendance status and remarks for every teacher in a department roster sheet.",
      },
      { property: "og:title", content: "Student Assistant Attendance Entry" },
      {
        property: "og:description",
        content: "Log faculty attendance records that sync straight to the HR master table.",
      },
    ],
  }),
  component: SAModule,
});

type RowState = {
  room_assignment: string;
  time_arrival: string;
  time_out: string;
  attendance_status: string;
  remarks: string;
  other_remark: string;
};

const EMPTY_ROW: RowState = {
  room_assignment: "",
  time_arrival: "",
  time_out: "",
  attendance_status: "",
  remarks: "None",
  other_remark: "",
};

type Teacher = { id: string; full_name: string; department_id: string };

function SAModule() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [id]: { ...EMPTY_ROW, ...r[id], ...patch } }));

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, full_name, department_id")
        .order("full_name");
      if (error) throw error;
      return data as Teacher[];
    },
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments
      .filter((d) => departmentId === "all" || d.id === departmentId)
      .map((d) => ({
        id: d.id,
        name: d.name,
        teachers: teachers.filter(
          (t) => t.department_id === d.id && (!q || t.full_name.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.teachers.length > 0 || !q);
  }, [departments, teachers, departmentId, search]);

  // Every teacher with an attendance status checked is submitted — Present, Late or Absent.
  const readyRows = useMemo(
    () => teachers.filter((t) => !!rows[t.id]?.attendance_status),
    [teachers, rows],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const selected = readyRows;
      if (selected.length === 0) throw new Error("No attendance status has been checked yet");
      const payload = selected.map((t) => {
        const r = rows[t.id]!;
        return {
          teacher_id: t.id,
          department_id: t.department_id,
          submitted_by: user.id,
          room_assignment: r.room_assignment || "—",
          time_arrival: r.time_arrival || null,
          time_out: r.time_out || null,
          attendance_status: r.attendance_status as "Present" | "Late" | "Absent",
          remarks: r.remarks === "Others" ? r.other_remark.trim() || "Others" : r.remarks,
        };
      });
      const { data, error } = await supabase
        .from("attendance_records")
        .insert(payload)
        .select("id");
      if (error) throw error;
      const saved = data?.length ?? 0;
      if (saved !== payload.length) {
        throw new Error(
          `Submission mismatch: ${payload.length} records checked but ${saved} saved. Please review and resubmit.`,
        );
      }
      const usedDepartments = Array.from(new Set(selected.map((t) => t.department_id)));
      const singleDept = usedDepartments.length === 1 ? usedDepartments[0]! : null;
      const { error: notifyError } = await supabase.from("submission_notifications").insert({
        submitted_by: user.id,
        submitted_by_name: fullName,
        department_id: singleDept,
        department_name: singleDept
          ? (departments.find((d) => d.id === singleDept)?.name ?? null)
          : `${usedDepartments.length} departments`,
        record_count: saved,
      });
      if (notifyError) throw notifyError;
      return saved;
    },
    onSuccess: (count) => {
      setRows({});
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
              Fill in the rows you observed, then submit. Your account ID and an exact timestamp are
              attached automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-bold uppercase tracking-wide">Select Department:</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-bold uppercase tracking-wide">Search Teachers Name:</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type a teacher's name"
                  />
                </div>
              </div>
            </div>

            {groups.map((g) => (
              <section key={g.id} className="space-y-2">
                <span className="inline-block rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                  {g.name}
                </span>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[1000px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-secondary/60">
                        <th rowSpan={2} className="border border-border px-3 py-2 text-left">
                          Teachers Name
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
                          <th key={s} className="w-12 border border-border px-3 py-1 text-center">
                            {s[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.teachers.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="border border-border px-3 py-6 text-center text-muted-foreground"
                          >
                            No teachers found.
                          </td>
                        </tr>
                      )}
                      {g.teachers.map((t) => {
                        const r = rows[t.id] ?? EMPTY_ROW;
                        return (
                          <tr key={t.id} className="align-top">
                            <td className="border border-border px-3 py-2 font-medium">
                              {t.full_name}
                            </td>
                            <td className="border border-border p-1">
                              <Select
                                value={r.room_assignment}
                                onValueChange={(v) =>
                                  setRow(t.id, { room_assignment: v === "__clear__" ? "" : v })
                                }
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
                                onValueChange={(v) =>
                                  setRow(t.id, { time_arrival: v === "__clear__" ? "" : v })
                                }
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
                                onValueChange={(v) =>
                                  setRow(t.id, { time_out: v === "__clear__" ? "" : v })
                                }
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
                                onValueChange={(v) =>
                                  setRow(t.id, { remarks: v === "__clear__" ? "None" : v })
                                }
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
              </section>
            ))}

            <div className="flex flex-wrap items-center gap-3">
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
              <span className="text-sm font-medium text-muted-foreground">
                {readyRows.length} of {teachers.length} teacher
                {teachers.length === 1 ? "" : "s"} checked — all checked rows (including Absent) are
                submitted.
              </span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
