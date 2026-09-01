import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Account Approval — Attendance Monitoring" },
      {
        name: "description",
        content:
          "HR review queue for new Student Assistant and HR sign-up requests: approve or reject each account before it can access the system.",
      },
      { property: "og:title", content: "Account Approval" },
      {
        property: "og:description",
        content: "Approve or reject pending Student Assistant and HR account registrations.",
      },
    ],
  }),
  component: ApprovalsPage,
});

type PendingRow = {
  id: string;
  full_name: string;
  email: string;
  id_number: string | null;
  course_year: string | null;
  class_schedule: string | null;
  mobile_number: string | null;
  created_at: string;
  approval_status: string;
  approved_at: string | null;
  role: string;
};

function ApprovalsPage() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "decided">("pending");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["account-approvals"],
    enabled: role === "hr",
    refetchOnMount: "always",
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roleRows, error: roleErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, id_number, course_year, class_schedule, mobile_number, created_at, approval_status, approved_at",
          )
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (roleErr) throw roleErr;
      const roleMap = new Map((roleRows ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles ?? []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? "—",
      })) as PendingRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          approval_status: status,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: ["account-approvals"] });
      toast.success(
        status === "approved"
          ? "Account approved — the user can now sign in."
          : "Account rejected — the user cannot access the system.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (tab === "pending" ? r.approval_status === "pending" : r.approval_status !== "pending"))
      .filter((r) =>
        !q
          ? true
          : [r.full_name, r.email, r.id_number, r.role]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [rows, search, tab]);

  const pendingCount = rows.filter((r) => r.approval_status === "pending").length;

  if (role && role !== "hr") {
    return (
      <div className="min-h-screen">
        <AppHeader name={fullName} role="Student Assistant" userId={user?.id} isSA />
        <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
          This page is only available to HR accounts.
        </div>
      </div>
    );
  }

  const roleLabel = (r: string) =>
    r === "hr" ? "Human Resources" : r === "student_assistant" ? "Student Assistant" : "—";

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Human Resources" userId={user?.id} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Account Approval</CardTitle>
              <CardDescription>
                {pendingCount} account{pendingCount === 1 ? "" : "s"} awaiting your decision. New
                Student Assistant and HR sign-ups stay locked out until you approve them here.
              </CardDescription>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, ID number…"
              className="sm:max-w-xs"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={tab === "pending" ? "default" : "outline"}
                onClick={() => setTab("pending")}
              >
                Pending ({pendingCount})
              </Button>
              <Button
                size="sm"
                variant={tab === "decided" ? "default" : "outline"}
                onClick={() => setTab("decided")}
              >
                Decided
              </Button>
            </div>

            {isLoading && <p className="text-muted-foreground">Loading accounts…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-muted-foreground">
                {tab === "pending" ? "No sign-up requests waiting for approval." : "No decided accounts yet."}
              </p>
            )}
            {filtered.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-secondary/60 text-left">
                      <th className="p-2 font-bold">Full Name</th>
                      <th className="p-2 font-bold">Requested Role</th>
                      <th className="p-2 font-bold">Email</th>
                      <th className="p-2 font-bold">ID Number</th>
                      <th className="p-2 font-bold">Registered</th>
                      <th className="p-2 font-bold">Status</th>
                      <th className="p-2 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-border align-middle">
                        <td className="p-2 font-bold">{r.full_name}</td>
                        <td className="p-2">{roleLabel(r.role)}</td>
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">{r.id_number ?? "—"}</td>
                        <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="p-2">
                          <Badge
                            variant={
                              r.approval_status === "approved"
                                ? "default"
                                : r.approval_status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.approval_status}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end gap-2">
                            {r.approval_status !== "approved" && (
                              <Button
                                size="sm"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                              >
                                Approve
                              </Button>
                            )}
                            {r.approval_status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                              >
                                Reject
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
