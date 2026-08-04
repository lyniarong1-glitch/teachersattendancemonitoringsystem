import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Printer, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "Master Attendance Table — HR Module" },
      {
        name: "description",
        content:
          "Monitor every faculty attendance entry, filter by department or teacher, correct records with audit timestamps, and export to Excel, PDF or print.",
      },
      { property: "og:title", content: "HR Master Attendance Table" },
      {
        property: "og:description",
        content: "Oversight, editing and reporting for campus faculty attendance records.",
      },
    ],
  }),
  component: HRModule,
});

type RecordRow = {
  id: string;
  room_assignment: string;
  time_arrival: string | null;
  time_out: string | null;
  attendance_status: "Present" | "Late" | "Absent";
  remarks: string | null;
  date_submitted: string;
  time_submitted: string;
  last_edited_at: string | null;
  teacher_id: string;
  department_id: string;
  teachers: { full_name: string } | null;
  departments: { name: string } | null;
  submitted_by: string | null;
  profiles: {
    id: string;
    full_name: string;
    birthdate: string | null;
    email: string;
    address: string | null;
    id_number: string | null;
  } | null;
};


function HRModule() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [teacherView, setTeacherView] = useState<{ id: string; name: string } | null>(null);
  const [saView, setSaView] = useState<RecordRow["profiles"] | null>(null);



  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["all-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "id, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, last_edited_at, teacher_id, department_id, submitted_by, teachers(full_name), departments(name), profiles:submitted_by(id, full_name, birthdate, email, address, id_number)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RecordRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(
      (r) =>
        (department === "all" || r.department_id === department) &&
        (!q || (r.teachers?.full_name ?? "").toLowerCase().includes(q)),
    );
  }, [records, department, search]);

  const teacherRecords = useMemo(() => {
    if (!teacherView) return [];
    return records
      .filter((r) => r.teacher_id === teacherView.id)
      .sort(
        (a, b) =>
          `${b.date_submitted} ${b.time_submitted}`.localeCompare(
            `${a.date_submitted} ${a.time_submitted}`,
          ),
      );
  }, [records, teacherView]);



  const update = useMutation({
    mutationFn: async (patch: RecordRow) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("attendance_records")
        .update({
          room_assignment: patch.room_assignment,
          time_arrival: patch.time_arrival,
          time_out: patch.time_out,
          attendance_status: patch.attendance_status,
          remarks: patch.remarks,
          last_edited_by: user.id,
          last_edited_at: new Date().toISOString(),
        })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["all-records"] });
      toast.success("Record updated with edit timestamp");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const header = [
      "Teacher Name", "Department", "Room", "Time In", "Time Out", "Status",
      "Remarks", "Date Submitted", "Time Submitted", "Submitted By", "Last Edited",
    ];
    const rows = filtered.map((r) => [
      r.teachers?.full_name ?? "",
      r.departments?.name ?? "",
      r.room_assignment,
      formatTime(r.time_arrival),
      formatTime(r.time_out),
      r.attendance_status,
      r.remarks ?? "",
      r.date_submitted,
      formatTime(r.time_submitted?.slice(0, 5)),
      r.profiles?.full_name ?? "",
      r.last_edited_at ? new Date(r.last_edited_at).toLocaleString() : "",
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Excel (CSV) report downloaded");
  }

  if (role && role !== "hr") {
    return (
      <div className="min-h-screen">
        <AppHeader name={fullName} role="Student Assistant" />
        <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
          This module is only available to HR accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Human Resources" />
      <main className="mx-auto max-w-[95rem] space-y-6 px-4 py-8">
        <Card>
          <CardHeader className="no-print flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Master Attendance Table</CardTitle>
              <CardDescription>
                {filtered.length} record{filtered.length === 1 ? "" : "s"} shown
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <FileText className="mr-2 h-4 w-4" /> Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="no-print grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Teacher Name</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search teacher…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Time In</TableHead>
                    <TableHead>Time Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Date Submitted</TableHead>
                    <TableHead>Time Submitted</TableHead>
                    <TableHead>Submitted By (SA)</TableHead>
                    <TableHead className="no-print">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        Loading records…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        No attendance records match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-left font-semibold text-primary underline underline-offset-2 hover:opacity-80"
                          onClick={() =>
                            setTeacherView({
                              id: r.teacher_id,
                              name: r.teachers?.full_name ?? "Teacher",
                            })
                          }
                        >
                          {r.teachers?.full_name}
                        </button>
                      </TableCell>

                      <TableCell>{r.departments?.name}</TableCell>
                      <TableCell>{r.room_assignment}</TableCell>
                      <TableCell>{formatTime(r.time_arrival)}</TableCell>
                      <TableCell>{formatTime(r.time_out)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.attendance_status === "Present"
                              ? "default"
                              : r.attendance_status === "Late"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {r.attendance_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.remarks || "None"}
                        {r.last_edited_at && (
                          <div className="text-xs text-muted-foreground">
                            edited {new Date(r.last_edited_at).toLocaleString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{r.date_submitted}</TableCell>
                      <TableCell>{formatTime(r.time_submitted?.slice(0, 5))}</TableCell>
                      <TableCell>
                        {r.profiles ? (
                          <button
                            type="button"
                            onClick={() => setSaView(r.profiles)}
                            className="font-bold text-primary underline-offset-2 hover:underline"
                          >
                            {r.profiles.full_name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="no-print">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!saView} onOpenChange={(o) => !o && setSaView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Student Assistant Information</DialogTitle>
            <DialogDescription>Personal details of the submitting account.</DialogDescription>
          </DialogHeader>
          {saView && (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Full Name</dt>
                <dd className="font-bold">{saView.full_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ID Number</dt>
                <dd className="font-bold">{saView.id_number || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date of Birth</dt>
                <dd className="font-bold">{saView.birthdate || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-bold">Student Assistant</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email Address</dt>
                <dd className="font-bold break-all">{saView.email}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-bold">{saView.address || "—"}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaView(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog open={!!teacherView} onOpenChange={(o) => !o && setTeacherView(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{teacherView?.name} — Attendance History</DialogTitle>
            <DialogDescription>
              {teacherRecords.length} record{teacherRecords.length === 1 ? "" : "s"}, most recent
              first.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teacherRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      No records for this teacher yet.
                    </TableCell>
                  </TableRow>
                )}
                {teacherRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date_submitted}</TableCell>
                    <TableCell>{formatTime(r.time_submitted?.slice(0, 5))}</TableCell>
                    <TableCell>{r.departments?.name}</TableCell>
                    <TableCell>{r.room_assignment}</TableCell>
                    <TableCell>{formatTime(r.time_arrival)}</TableCell>
                    <TableCell>{formatTime(r.time_out)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.attendance_status === "Present"
                            ? "default"
                            : r.attendance_status === "Late"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {r.attendance_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.remarks || "None"}
                      {r.last_edited_at && (
                        <div className="text-xs text-muted-foreground">
                          edited {new Date(r.last_edited_at).toLocaleString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.profiles ? (
                        <button
                          type="button"
                          onClick={() => setSaView(r.profiles)}
                          className="font-bold text-primary underline-offset-2 hover:underline"
                        >
                          {r.profiles.full_name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeacherView(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Master Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance Record</DialogTitle>
            <DialogDescription>
              {editing?.teachers?.full_name} · {editing?.departments?.name}. An edit timestamp and
              your HR account ID are recorded automatically.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Room</Label>
                <Select
                  value={editing.room_assignment}
                  onValueChange={(v) => setEditing({ ...editing, room_assignment: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ROOMS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Time In</Label>
                  <Select
                    value={editing.time_arrival?.slice(0, 5) ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, time_arrival: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {TIME_SLOTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Time Out</Label>
                  <Select
                    value={editing.time_out?.slice(0, 5) ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, time_out: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {TIME_SLOTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editing.attendance_status}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        attendance_status: v as RecordRow["attendance_status"],
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Select
                    value={
                      REMARKS_OPTIONS.includes(editing.remarks ?? "None")
                        ? (editing.remarks ?? "None")
                        : "Other"
                    }
                    onValueChange={(v) => setEditing({ ...editing, remarks: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REMARKS_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() => editing && update.mutate(editing)}
            >
              {update.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
