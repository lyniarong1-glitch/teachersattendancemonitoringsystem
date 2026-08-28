import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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
      { title: "My Recent Submission History — Student Assistant" },
      {
        name: "description",
        content:
          "Review every attendance record you have saved and synced, grouped by the date it was submitted.",
      },
      { property: "og:title", content: "My Recent Submission History" },
      {
        property: "og:description",
        content: "Student Assistant record of all successfully submitted teacher attendance entries.",
      },
    ],
  }),
  component: SubmissionHistoryPage,
});

function SubmissionHistoryPage() {
  const { user, fullName } = useSession();
  const navigate = useNavigate();

  const { data: mine = [], isLoading } = useQuery({
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

  const historyGroups = useMemo(() => {
    const map = new Map<string, typeof mine>();
    for (const r of mine) {
      const list = map.get(r.date_submitted);
      if (list) list.push(r);
      else map.set(r.date_submitted, [r]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [mine]);

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Student Assistant" userId={user?.id} isSA />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Button variant="outline" className="font-bold" onClick={() => void navigate({ to: "/sa" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Record Faculty Attendance
        </Button>

        <Card id="submission-history" className="scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My Recent Submission History</CardTitle>
            <CardDescription>
              {mine.length} saved / synced record{mine.length === 1 ? "" : "s"}, grouped by the date
              they were submitted (most recent first). Records still waiting to sync appear here once
              they reach the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading && <p className="text-muted-foreground">Loading your submissions…</p>}
            {!isLoading && mine.length === 0 && (
              <p className="text-muted-foreground">No records submitted yet.</p>
            )}
            {historyGroups.map(([date, rowsForDate]) => (
              <section key={date} className="space-y-2">
                <div className="rounded-md bg-secondary px-3 py-1.5 text-sm font-bold uppercase tracking-wide">
                  Date Submitted: {date} · {rowsForDate.length} record
                  {rowsForDate.length === 1 ? "" : "s"}
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
                      {rowsForDate.map((r) => (
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
