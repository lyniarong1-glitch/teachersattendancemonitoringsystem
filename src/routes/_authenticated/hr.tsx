import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteStudentAssistant } from "@/lib/account.functions";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
          "Monitor every faculty attendance entry grouped by date, filter by department or teacher, correct records with audit timestamps, and export to Excel, PDF or print.",
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
  created_at: string;
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
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_by_id_number: string | null;
  teachers: { full_name: string } | null;
  departments: { name: string } | null;
  profiles: { full_name: string } | null;
};

/** Name of the SA who submitted a record — falls back to the stored snapshot
 *  so deleted accounts keep their attribution. */
function submitterName(r: RecordRow) {
  return r.profiles?.full_name ?? r.submitted_by_name ?? "—";
}

const DATES_PER_PAGE = 3;
const SEEN_KEY = "tams:hr:records-seen-at";


function statusVariant(s: RecordRow["attendance_status"]) {
  return s === "Present" ? "default" : s === "Late" ? "secondary" : "destructive";
}

function HRModule() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [teacherView, setTeacherView] = useState<{ id: string; name: string } | null>(null);
  const [saView, setSaView] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deleteSa, setDeleteSa] = useState<{ id: string; name: string } | null>(null);
  const [saListOpen, setSaListOpen] = useState(false);

  useEffect(() => {
    setSeenAt(window.localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString());
  }, []);

  const markSeen = () => {
    const now = new Date().toISOString();
    window.localStorage.setItem(SEEN_KEY, now);
    setSeenAt(now);
  };


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
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "id, created_at, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, last_edited_at, teacher_id, department_id, submitted_by, submitted_by_name, submitted_by_id_number, teachers(full_name), departments(name), profiles:submitted_by(full_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RecordRow[];
    },
  });


  // New/synced submissions appear on this page as soon as they reach the server.
  useEffect(() => {
    const channel = supabase
      .channel("hr-attendance-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        () => void queryClient.invalidateQueries({ queryKey: ["all-records"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: studentAssistants = [] } = useQuery({
    queryKey: ["registered-sas"],
    queryFn: async () => {
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student_assistant");
      if (roleError) throw roleError;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, id_number, email, mobile_number, course, course_year, grade_level, class_schedule")
        .in("id", ids)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: saProfile } = useQuery({
    queryKey: ["sa-profile", saView],
    enabled: !!saView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", saView!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: saPhotoUrl } = useQuery({
    queryKey: ["sa-profile-photo", saProfile?.photo_path],
    enabled: !!saProfile?.photo_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(saProfile?.photo_path ?? "", 3600);
      if (error) throw error;
      return data.signedUrl;
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

  const groups = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    for (const r of filtered) {
      const list = map.get(r.date_submitted);
      if (list) list.push(r);
      else map.set(r.date_submitted, [r]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(groups.length / DATES_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = groups.slice(safePage * DATES_PER_PAGE, safePage * DATES_PER_PAGE + DATES_PER_PAGE);

  const teacherRecords = useMemo(() => {
    if (!teacherView) return [];
    return records
      .filter((r) => r.teacher_id === teacherView.id)
      .sort((a, b) =>
        `${b.date_submitted} ${b.time_submitted}`.localeCompare(
          `${a.date_submitted} ${a.time_submitted}`,
        ),
      );
  }, [records, teacherView]);

  const newRecords = useMemo(
    () => (seenAt ? records.filter((r) => r.created_at > seenAt) : []),
    [records, seenAt],
  );

  const removeSa = useMutation({
    mutationFn: (userId: string) => deleteStudentAssistant({ data: { userId } }),
    onSuccess: () => {
      setDeleteSa(null);
      setSaView(null);
      void queryClient.invalidateQueries({ queryKey: ["all-records"] });
      void queryClient.invalidateQueries({ queryKey: ["registered-sas"] });
      toast.success("Student Assistant account deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });


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

  function exportCsv(date: string, rows: RecordRow[]) {
    const header = [
      "Teacher Name", "Department", "Room", "Time In", "Time Out", "Status",
      "Remarks", "Time Submitted", "Submitted By", "Last Edited",
    ];
    const body = rows.map((r) => [
      r.teachers?.full_name ?? "",
      r.departments?.name ?? "",
      r.room_assignment,
      formatTime(r.time_arrival),
      formatTime(r.time_out),
      r.attendance_status,
      r.remarks ?? "",
      formatTime(r.time_submitted?.slice(0, 5)),
      submitterName(r) === "—" ? "" : submitterName(r),
      r.last_edited_at ? new Date(r.last_edited_at).toLocaleString() : "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Excel report for ${date} downloaded`);
  }

  if (role && role !== "hr") {
    return (
      <div className="min-h-screen">
        <AppHeader name={fullName} role="Student Assistant" userId={user?.id} isSA />
        <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
          This module is only available to HR accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Human Resources" userId={user?.id} onViewStudentAssistants={() => setSaListOpen(true)} />
      <main className="mx-auto max-w-[95rem] space-y-6 px-4 py-8">
        <Card className={`no-print border-l-4 ${newRecords.length ? "border-l-primary" : "border-l-muted"}`}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span className="relative">
                <Bell className={`h-5 w-5 ${newRecords.length ? "text-primary" : "text-muted-foreground"}`} />
                {newRecords.length > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {newRecords.length > 99 ? "99+" : newRecords.length}
                  </span>
                )}
              </span>
              <div>
                <p className="font-bold">
                  {newRecords.length
                    ? `${newRecords.length} new attendance record${newRecords.length === 1 ? "" : "s"} submitted`
                    : "No new attendance records"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {newRecords.length
                    ? newRecords
                        .slice(0, 3)
                        .map((r) => `${r.teachers?.full_name ?? "Teacher"} by ${submitterName(r)}`)
                        .join(" · ")
                    : "You're up to date. New submissions appear here automatically."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {newRecords.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setNotifOpen(true)}>
                  View new records
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={!newRecords.length} onClick={markSeen}>
                Mark all as read
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New attendance submissions</DialogTitle>
              <DialogDescription>
                {newRecords.length} record{newRecords.length === 1 ? "" : "s"} submitted since you last checked.
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Submitted</TableHead>
                  <TableHead>Submitted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.teachers?.full_name}</TableCell>
                    <TableCell>{r.departments?.name}</TableCell>
                    <TableCell><Badge variant="secondary">{r.attendance_status}</Badge></TableCell>
                    <TableCell>{r.date_submitted}</TableCell>
                    <TableCell>{submitterName(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DialogFooter>
              <Button onClick={() => { markSeen(); setNotifOpen(false); }}>Mark all as read</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>

          <CardHeader className="no-print">
            <CardTitle>Master Attendance Table</CardTitle>
            <CardDescription>
              {filtered.length} record{filtered.length === 1 ? "" : "s"} in {groups.length} date
              section{groups.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="no-print grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={department}
                  onValueChange={(v) => {
                    setDepartment(v);
                    setPage(0);
                  }}
                >
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
                <Label>Teachers Name</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search teacher…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
              </div>
            </div>

            {isLoading && <p className="text-muted-foreground">Loading records…</p>}
            {!isLoading && groups.length === 0 && (
              <p className="text-muted-foreground">
                No attendance records match the current filters.
              </p>
            )}

            {visibleGroups.map(([date, rows]) => (
              <section key={date} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="rounded-md bg-secondary px-3 py-1.5 text-sm font-bold uppercase tracking-wide">
                    Date Submitted: {date}
                  </div>
                  <div className="no-print flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportCsv(date, rows)}>
                      <Download className="mr-2 h-4 w-4" /> Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <FileText className="mr-2 h-4 w-4" /> Export PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teachers Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Time In &amp; Time Out</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead>Time Submitted</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead className="no-print">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <button
                              type="button"
                              className="text-left font-bold text-primary underline underline-offset-2 hover:opacity-80"
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
                          <TableCell>
                            {formatTime(r.time_arrival)} – {formatTime(r.time_out)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(r.attendance_status)}>
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
                          <TableCell>{formatTime(r.time_submitted?.slice(0, 5))}</TableCell>
                          <TableCell>
                            {r.submitted_by && r.profiles?.full_name ? (
                              <button
                                type="button"
                                className="text-left font-bold text-primary underline underline-offset-2 hover:opacity-80"
                                onClick={() => setSaView(r.submitted_by)}
                              >
                                {r.profiles.full_name}
                              </button>
                            ) : (
                              <span className="font-bold">
                                {submitterName(r)}
                                {r.submitted_by_name && !r.profiles?.full_name && (
                                  <span className="block text-xs font-normal text-muted-foreground">
                                    account deleted
                                  </span>
                                )}
                              </span>
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
              </section>
            ))}

            {groups.length > 0 && (
              <div className="no-print flex items-center justify-between gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous Page
                </Button>
                <span className="text-sm font-bold">
                  Page {safePage + 1} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next Page <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

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
                      <Badge variant={statusVariant(r.attendance_status)}>
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
                    <TableCell>{submitterName(r)}</TableCell>
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

      <Dialog open={!!saView} onOpenChange={(o) => !o && setSaView(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
          <div className="bg-primary p-6 text-primary-foreground">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Avatar className="h-24 w-24 border-4 border-primary-foreground/30">
                <AvatarImage src={saPhotoUrl} className="object-cover" />
                <AvatarFallback className="text-xl font-bold text-primary">
                  {(saProfile?.full_name ?? "SA").split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogHeader>
                  <DialogTitle className="text-2xl text-primary-foreground">{saProfile?.full_name ?? "Student Assistant Profile"}</DialogTitle>
                  <DialogDescription className="text-primary-foreground/80">Student ID: {saProfile?.id_number || "—"}</DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>
          <div className="space-y-6 p-6">
            <section><h3 className="mb-3 border-b pb-2 text-lg">Enrollment Information</h3>
              <dl className="grid gap-4 sm:grid-cols-3">
                {[["Grade Level", saProfile?.grade_level], ["Course", saProfile?.course ?? saProfile?.course_year], ["Class Schedule", saProfile?.class_schedule]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-bold">{value || "—"}</dd></div>)}
              </dl>
            </section>
            <section><h3 className="mb-3 border-b pb-2 text-lg">Personal Information</h3>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[["First Name", saProfile?.first_name ?? saProfile?.full_name], ["Middle Name", saProfile?.middle_name], ["Last Name", saProfile?.last_name], ["Date of Birth", saProfile?.birthdate], ["Mobile Number", saProfile?.mobile_number], ["Email Address", saProfile?.email]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-bold">{value || "—"}</dd></div>)}
              </dl>
            </section>
            <section><h3 className="mb-3 border-b pb-2 text-lg">Address</h3>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[["Street", saProfile?.street], ["Barangay", saProfile?.barangay], ["City", saProfile?.city], ["Province", saProfile?.province]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-bold">{value || "—"}</dd></div>)}
              </dl>
            </section>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setSaView(null)}><ArrowLeft className="mr-2 h-4 w-4" />Back to Master Table</Button>
              <Button variant="destructive" onClick={() => saView && setDeleteSa({ id: saView, name: saProfile?.full_name ?? "this Student Assistant" })}><Trash2 className="mr-2 h-4 w-4" />Delete SA Account</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSa} onOpenChange={(o) => !o && setDeleteSa(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteSa?.name}'s account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their access to the system. All attendance records they
              submitted stay in the master table exactly as recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeSa.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteSa) removeSa.mutate(deleteSa.id); }}
            >
              {removeSa.isPending ? "Deleting…" : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
              <div className="space-y-2">
                <Label>Attendance Status</Label>
                <div className="flex flex-wrap items-center gap-5 rounded-md border border-border p-3">
                  {STATUS_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm font-bold">
                      <Checkbox
                        checked={editing.attendance_status === s}
                        onCheckedChange={(c) =>
                          setEditing({
                            ...editing,
                            attendance_status: (c
                              ? s
                              : editing.attendance_status) as RecordRow["attendance_status"],
                          })
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tick a different status to undo an accidental selection before saving.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Select
                  value={
                    REMARKS_OPTIONS.includes(editing.remarks ?? "None")
                      ? (editing.remarks ?? "None")
                      : "Others"
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={() => editing && update.mutate(editing)}>
              {update.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
