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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  formatTimeExact,
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
  teachers: { full_name: string } | null;
  departments: { name: string } | null;
  profiles: { full_name: string } | null;
};

const DATES_PER_PAGE = 3;

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
  const [batchView, setBatchView] = useState<{
    id: string;
    submitted_by: string | null;
    submitted_by_name: string | null;
    department_name: string | null;
    record_count: number;
    submitted_at: string;
  } | null>(null);
  const [page, setPage] = useState(0);
  // Batch keys (date|time|submitter) HR has already reviewed from a notification.
  const [reviewedKeys, setReviewedKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("hr-reviewed-batches") ?? "[]");
    } catch {
      return [];
    }
  });
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const addReviewedKeys = (keys: string[]) => {
    setReviewedKeys((prev) => {
      const next = [...new Set([...prev, ...keys])].slice(-200);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("hr-reviewed-batches", JSON.stringify(next));
      }
      return next;
    });
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "id, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, last_edited_at, teacher_id, department_id, submitted_by, teachers(full_name), departments(name), profiles:submitted_by(full_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RecordRow[];
    },
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["submission-notifications"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submission_notifications")
        .select("id, submitted_by, submitted_by_name, department_name, record_count, submitted_at, read_at")
        .order("submitted_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id?: string) => {
      const query = supabase
        .from("submission_notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      const { error } = id ? await query.eq("id", id) : await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["submission-notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: batchRecords = [], isLoading: batchLoading } = useQuery({
    queryKey: ["batch-records", batchView?.id],
    enabled: !!batchView,
    queryFn: async () => {
      const submittedAt = new Date(batchView!.submitted_at);
      const from = new Date(submittedAt.getTime() - 5 * 60 * 1000).toISOString();
      const to = new Date(submittedAt.getTime() + 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "id, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, last_edited_at, teacher_id, department_id, submitted_by, teachers(full_name), departments(name), profiles:submitted_by(full_name)",
        )
        .eq("submitted_by", batchView!.submitted_by!)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(batchView!.record_count || 500);
      if (error) throw error;
      return data as unknown as RecordRow[];
    },
  });

  // Once a submitted batch is reviewed, register it in the Master Attendance Table.
  useEffect(() => {
    if (!batchView || batchRecords.length === 0) return;
    const keys = [
      ...new Set(
        batchRecords.map(
          (r) => `${r.date_submitted}|${r.time_submitted}|${r.submitted_by ?? "unknown"}`,
        ),
      ),
    ];
    addReviewedKeys(keys);
    setHighlightKey(keys[0] ?? null);
    queryClient.invalidateQueries({ queryKey: ["all-records"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchView?.id, batchRecords.length]);



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
    // One section per submission batch (date + exact time + submitter) so a new
    // submission is never merged into an older one.
    const map = new Map<string, RecordRow[]>();
    for (const r of filtered) {
      const key = `${r.date_submitted}|${r.time_submitted}|${r.submitted_by ?? "unknown"}`;
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(groups.length / DATES_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = groups.slice(safePage * DATES_PER_PAGE, safePage * DATES_PER_PAGE + DATES_PER_PAGE);

  // Jump the master table to the page holding the just-reviewed batch.
  useEffect(() => {
    if (!highlightKey) return;
    const idx = groups.findIndex(([k]) => k === highlightKey);
    if (idx >= 0) setPage(Math.floor(idx / DATES_PER_PAGE));
  }, [highlightKey, groups]);


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
      formatTimeExact(r.time_submitted),
      r.profiles?.full_name ?? "",
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
      <AppHeader name={fullName} role="Human Resources" userId={user?.id} />
      <main className="mx-auto max-w-[95rem] space-y-6 px-4 py-8">
        <Card className="no-print">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle className="text-base">Submission Notifications</CardTitle>
              {unreadCount > 0 && <Badge variant="destructive">{unreadCount} new</Badge>}
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => markRead.mutate(undefined)}>
                Mark all as read
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.length === 0 && (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setBatchView(n);
                  if (!n.read_at) markRead.mutate(n.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setBatchView(n);
                    if (!n.read_at) markRead.mutate(n.id);
                  }
                }}
                className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm transition hover:border-primary hover:bg-secondary/60 ${n.read_at ? "opacity-60" : "bg-secondary/40 font-medium"}`}
              >
                <span>
                  <button
                    className="underline underline-offset-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSaView(n.submitted_by);
                    }}
                  >
                    {n.submitted_by_name ?? "Student Assistant"}
                  </button>{" "}
                  submitted {n.record_count} attendance record
                  {n.record_count === 1 ? "" : "s"}
                  {n.department_name ? ` for ${n.department_name}` : ""} on{" "}
                  {new Date(n.submitted_at).toLocaleString()}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">Click to review</Badge>
                  {!n.read_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead.mutate(n.id);
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="no-print">
            <CardTitle>Master Attendance Table</CardTitle>
            <CardDescription>
              {filtered.length} record{filtered.length === 1 ? "" : "s"} in {groups.length}{" "}
              submission batch{groups.length === 1 ? "" : "es"} — newest first, never merged
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

            {visibleGroups.map(([key, rows]) => {
              const date = key.split("|")[0]!;
              const time = key.split("|")[1]!;
              const submitter = rows[0]?.profiles?.full_name ?? "Unknown";
              const isReviewed = reviewedKeys.includes(key);
              return (
              <section
                key={key}
                className={`space-y-2 rounded-md ${key === highlightKey ? "ring-2 ring-primary p-2" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-md bg-secondary px-3 py-1.5 text-sm font-bold uppercase tracking-wide">
                      Date Submitted: {date} · {formatTimeExact(time)} · {submitter} · {rows.length}{" "}
                      record{rows.length === 1 ? "" : "s"}
                    </div>
                    {isReviewed && <Badge variant="secondary">Reviewed &amp; recorded</Badge>}
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
                          <TableCell>{formatTimeExact(r.time_submitted)}</TableCell>
                          <TableCell>
                            {r.submitted_by ? (
                              <button
                                type="button"
                                className="text-left font-bold text-primary underline underline-offset-2 hover:opacity-80"
                                onClick={() => setSaView(r.submitted_by)}
                              >
                                {r.profiles?.full_name ?? "Student Assistant"}
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
              </section>
              );
            })}

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
                    <TableCell>{formatTimeExact(r.time_submitted)}</TableCell>
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
                    <TableCell>{r.profiles?.full_name ?? "—"}</TableCell>
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

      <Dialog
        open={!!batchView}
        onOpenChange={(o) => {
          if (!o) {
            setBatchView(null);
            toast.success("Reviewed batch recorded in the Master Attendance Table");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Submitted Attendance Records — {batchView?.submitted_by_name ?? "Student Assistant"}
            </DialogTitle>
            <DialogDescription>
              {batchView?.record_count} record{batchView?.record_count === 1 ? "" : "s"}
              {batchView?.department_name ? ` · ${batchView.department_name}` : ""} · submitted{" "}
              {batchView ? new Date(batchView.submitted_at).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Time Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Time Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Loading records…
                    </TableCell>
                  </TableRow>
                )}
                {!batchLoading && batchRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No records found for this submission.
                    </TableCell>
                  </TableRow>
                )}
                {batchRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button
                        className="underline underline-offset-2"
                        onClick={() => {
                          setBatchView(null);
                          setTeacherView({ id: r.teacher_id, name: r.teachers?.full_name ?? "" });
                        }}
                      >
                        {r.teachers?.full_name ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell>{r.departments?.name}</TableCell>
                    <TableCell>{r.room_assignment}</TableCell>
                    <TableCell>{formatTime(r.time_arrival)}</TableCell>
                    <TableCell>{formatTime(r.time_out)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.attendance_status)}>
                        {r.attendance_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.remarks || "None"}</TableCell>
                    <TableCell>
                      {r.date_submitted} {formatTimeExact(r.time_submitted)}
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
            <Button variant="outline" onClick={() => setBatchView(null)}>
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
            <DialogFooter><Button variant="outline" onClick={() => setSaView(null)}><ArrowLeft className="mr-2 h-4 w-4" />Back to Master Table</Button></DialogFooter>
          </div>
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
