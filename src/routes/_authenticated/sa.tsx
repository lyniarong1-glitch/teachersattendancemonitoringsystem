import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

function SAModule() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState("");
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
    queryKey: ["teachers", departmentId],
    enabled: !!departmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, full_name")
        .eq("department_id", departmentId)
        .order("full_name");
      if (error) throw error;
      return data;
    },
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
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const readyRows = useMemo(
    () =>
      teachers.filter((t) => {
        const r = rows[t.id];
        if (!r) return false;
        if (!r.room_assignment || !r.attendance_status) return false;
        if (r.attendance_status !== "Absent" && (!r.time_arrival || !r.time_out)) return false;
        return true;
      }),
    [teachers, rows],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const payload = readyRows.map((t) => {
        const r = rows[t.id]!;
        return {
          teacher_id: t.id,
          department_id: departmentId,
          submitted_by: user.id,
          room_assignment: r.room_assignment,
          time_arrival: r.time_arrival || null,
          time_out: r.time_out || null,
          attendance_status: r.attendance_status as "Present" | "Late" | "Absent",
          remarks:
            r.remarks === "Others" ? r.other_remark.trim() || "Others" : r.remarks,
        };
      });
      const { error } = await supabase.from("attendance_records").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      setRows({});
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      toast.success(`${count} attendance record${count === 1 ? "" : "s"} submitted`);
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
      <AppHeader name={fullName} role="Student Assistant" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Record Faculty Attendance</CardTitle>
            <CardDescription>
              Pick a department, fill in the rows you observed, then submit. Your account ID and an
              exact timestamp are attached automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="max-w-xs space-y-2">
              <Label>Department</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v);
                  setRows({});
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    {teachers.map((t) => {
                      const r = rows[t.id] ?? EMPTY_ROW;
                      return (
                        <tr key={t.id} className="align-top">
                          <td className="border border-border px-3 py-2 font-medium">
                            {t.full_name}
                          </td>
                          <td className="border border-border p-1">
                            <Select
                              value={r.room_assignment}
                              onValueChange={(v) => setRow(t.id, { room_assignment: v })}
                            >
                              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Room" /></SelectTrigger>
                              <SelectContent className="max-h-72">
                                {ROOMS.map((room) => (
                                  <SelectItem key={room} value={room}>{room}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-border p-1">
                            <Select
                              value={r.time_arrival}
                              onValueChange={(v) => setRow(t.id, { time_arrival: v })}
                            >
                              <SelectTrigger className="h-9 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent className="max-h-72">
                                {TIME_SLOTS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="border border-border p-1">
                            <Select
                              value={r.time_out}
                              onValueChange={(v) => setRow(t.id, { time_out: v })}
                            >
                              <SelectTrigger className="h-9 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent className="max-h-72">
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
                              onValueChange={(v) => setRow(t.id, { remarks: v })}
                            >
                              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Remarks" /></SelectTrigger>
                              <SelectContent>
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

        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Delete My Account</CardTitle>
            <CardDescription>
              Resigning? Deleting your account permanently removes your sign-in access to this
              system. Attendance records you submitted stay in the HR master table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={removeAccount.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {removeAccount.isPending ? "Deleting…" : "Delete Account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. You will be signed out immediately and will no longer be
                    able to access the Teachers Attendance Monitoring System.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeAccount.mutate()}>
                    Yes, delete my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

