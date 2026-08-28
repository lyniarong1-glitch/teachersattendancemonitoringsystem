import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/attendance-constants";

export const Route = createFileRoute("/_authenticated/sa-history")({
  head: () => ({
    meta: [
      { title: "My Recent History — Student Assistant Submissions" },
      {
        name: "description",
        content:
          "Review every faculty attendance record you submitted, grouped by date of submission with page-by-page navigation.",
      },
      { property: "og:title", content: "My Recent Attendance Submission History" },
      {
        property: "og:description",
        content: "Student Assistant submission history grouped by date submitted.",
      },
    ],
  }),
  component: SAHistory,
});

type HistoryRow = {
  id: string;
  room_assignment: string;
  time_arrival: string | null;
  time_out: string | null;
  attendance_status: string;
  remarks: string | null;
  date_submitted: string;
  time_submitted: string;
  teachers: { full_name: string } | null;
  departments: { name: string } | null;
};

const DATES_PER_PAGE = 3;

function SAHistory() {
  const { user, role, fullName } = useSession();
  const [page, setPage] = useState(0);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-records", user?.id],
    enabled: !!user,
    refetchOnMount: "always",
    queryFn: async () => {
      const all: HistoryRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("attendance_records")
          .select(
            "id, room_assignment, time_arrival, time_out, attendance_status, remarks, date_submitted, time_submitted, teachers(full_name), departments(name)",
          )
          .eq("submitted_by", user!.id)
          .order("date_submitted", { ascending: false })
          .order("time_submitted", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as HistoryRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const r of rows) {
      const list = map.get(r.date_submitted);
      if (list) list.push(r);
      else map.set(r.date_submitted, [r]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.time_submitted ?? "").localeCompare(a.time_submitted ?? ""));
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(groups.length / DATES_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = groups.slice(safePage * DATES_PER_PAGE, safePage * DATES_PER_PAGE + DATES_PER_PAGE);



  if (role && role !== "student_assistant") {
    return (
      <div className="min-h-screen">
        <AppHeader name={fullName} role="HR" userId={user?.id} />
        <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
          This page is only available to Student Assistant accounts.
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
            <CardTitle>My Recent History</CardTitle>
            <CardDescription>
              {rows.length} submitted record{rows.length === 1 ? "" : "s"} in {groups.length} date
              group{groups.length === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading && <p className="text-muted-foreground">Loading your history…</p>}
            {!isLoading && groups.length === 0 && (
              <p className="text-muted-foreground">No records submitted yet.</p>
            )}

            {visible.map(([date, group]) => (
              <section key={date} className="space-y-2">
                <div className="rounded-md bg-secondary px-3 py-1.5 text-sm font-bold uppercase tracking-wide">
                  Date Submitted: {date} · {group.length} record{group.length === 1 ? "" : "s"}
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-secondary/60">
                        <th className="border border-border px-3 py-2 text-left">Time Submitted</th>
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
                      {group.map((r) => (
                        <tr key={r.id}>
                          <td className="border border-border px-3 py-2">
                            {formatTime(r.time_submitted?.slice(0, 5))}
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
              </section>
            ))}

            {groups.length > 0 && (
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
