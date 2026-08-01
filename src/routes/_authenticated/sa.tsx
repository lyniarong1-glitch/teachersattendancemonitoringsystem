import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
          "Select a department and teacher, then log room assignment, arrival and departure times, attendance status and remarks.",
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

type Confirmation = {
  teacher: string;
  department: string;
  room: string;
  arrival: string;
  out: string;
  status: string;
  remarks: string;
  stamp: string;
};

type FormState = {
  department_id: string;
  teacher_id: string;
  room_assignment: string;
  time_arrival: string;
  time_out: string;
  attendance_status: string;
  remarks: string;
  other_remark: string;
};

const EMPTY: FormState = {
  department_id: "",
  teacher_id: "",
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
  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers", form.department_id],
    enabled: !!form.department_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, full_name")
        .eq("department_id", form.department_id)
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

  const departmentName = useMemo(
    () => departments.find((d) => d.id === form.department_id)?.name ?? "",
    [departments, form.department_id],
  );
  const teacherName = useMemo(
    () => teachers.find((t) => t.id === form.teacher_id)?.full_name ?? "",
    [teachers, form.teacher_id],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const remarks =
        form.remarks === "Other" ? form.other_remark.trim() || "Other" : form.remarks;
      const { error } = await supabase.from("attendance_records").insert({
        teacher_id: form.teacher_id,
        department_id: form.department_id,
        submitted_by: user.id,
        room_assignment: form.room_assignment,
        time_arrival: form.time_arrival || null,
        time_out: form.time_out || null,
        attendance_status: form.attendance_status as "Present" | "Late" | "Absent",
        remarks,
      });
      if (error) throw error;
      return remarks;
    },
    onSuccess: (remarks) => {
      setConfirmed({
        teacher: teacherName,
        department: departmentName,
        room: form.room_assignment,
        arrival: formatTime(form.time_arrival),
        out: formatTime(form.time_out),
        status: form.attendance_status,
        remarks,
        stamp: new Date().toLocaleString(),
      });
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      toast.success("Attendance record submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    form.department_id &&
    form.teacher_id &&
    form.room_assignment &&
    form.attendance_status &&
    (form.attendance_status === "Absent" || (form.time_arrival && form.time_out));

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
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record Faculty Attendance</CardTitle>
            <CardDescription>
              Your account ID and an exact timestamp are attached automatically on submit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <Select
                  value={form.department_id}
                  onValueChange={(v) => set({ department_id: v, teacher_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Teacher">
                <Select
                  value={form.teacher_id}
                  onValueChange={(v) => set({ teacher_id: v })}
                  disabled={!form.department_id}
                >
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Room Assignment">
              <Select
                value={form.room_assignment}
                onValueChange={(v) => set({ room_assignment: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {ROOMS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time of Arrival">
                <Select value={form.time_arrival} onValueChange={(v) => set({ time_arrival: v })}>
                  <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Time Out">
                <Select value={form.time_out} onValueChange={(v) => set({ time_out: v })}>
                  <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Attendance Status">
                <Select
                  value={form.attendance_status}
                  onValueChange={(v) => set({ attendance_status: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Remarks">
                <Select value={form.remarks} onValueChange={(v) => set({ remarks: v })}>
                  <SelectTrigger><SelectValue placeholder="Select remark" /></SelectTrigger>
                  <SelectContent>
                    {REMARKS_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {form.remarks === "Other" && (
              <Field label="Specify Remark">
                <Input
                  value={form.other_remark}
                  maxLength={200}
                  onChange={(e) => set({ other_remark: e.target.value })}
                  placeholder="Describe the remark"
                />
              </Field>
            )}

            <Button
              className="w-full"
              disabled={!canSubmit || submit.isPending}
              onClick={() => submit.mutate()}
            >
              <Send className="mr-2 h-4 w-4" />
              {submit.isPending ? "Submitting…" : "Submit Record"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {confirmed && (
            <Card className="border-primary/40 bg-secondary/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-5 w-5 text-primary" /> Submission Confirmed
                </CardTitle>
                <CardDescription>Saved to the HR master table.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row k="Teacher" v={confirmed.teacher} />
                <Row k="Department" v={confirmed.department} />
                <Row k="Room" v={confirmed.room} />
                <Row k="Time In" v={confirmed.arrival} />
                <Row k="Time Out" v={confirmed.out} />
                <Row k="Status" v={confirmed.status} />
                <Row k="Remarks" v={confirmed.remarks} />
                <Row k="Timestamp" v={confirmed.stamp} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">My Recent Submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mine.length === 0 && (
                <p className="text-sm text-muted-foreground">No records submitted yet.</p>
              )}
              {mine.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.teachers?.full_name}</span>
                    <Badge variant="secondary">{r.attendance_status}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {r.departments?.name} · {r.room_assignment} · {formatTime(r.time_arrival)} –{" "}
                    {formatTime(r.time_out)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.date_submitted} {formatTime(r.time_submitted?.slice(0, 5))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
