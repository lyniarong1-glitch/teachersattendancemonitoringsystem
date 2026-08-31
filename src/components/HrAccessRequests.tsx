import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type RequestRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  decided_at: string | null;
};

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

/** HR access approval screen: pending requests plus a full approval history. */
export function HrAccessRequests() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["hr-access-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_access_requests")
        .select("id, full_name, email, status, created_at, decided_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RequestRow[];
    },
    refetchOnMount: "always",
  });

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (approve) {
        const { error } = await supabase.rpc("approve_hr_request", { _request_id: id });
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("hr_access_requests")
          .update({
            status: "rejected",
            decided_at: new Date().toISOString(),
            decided_by: auth.user?.id ?? null,
          })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ["hr-access-requests"] });
      toast.success(v.approve ? "HR access granted" : "Request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base font-bold">HR Access Approvals</CardTitle>
        <CardDescription className="font-medium">
          New HR sign-ups cannot access the system until an existing HR officer approves them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-bold">
            Pending requests{pending.length > 0 ? ` (${pending.length})` : ""}
          </h3>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading requests…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending HR access requests.</p>
          ) : (
            pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-bold">{r.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{r.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatDateTime(r.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, approve: true })}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, approve: false })}
                  >
                    <ShieldX className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold">Approval history</h3>
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">Email</TableHead>
                    <TableHead className="font-bold">Requested</TableHead>
                    <TableHead className="font-bold">Decided</TableHead>
                    <TableHead className="font-bold">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decided.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold">{r.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email}</TableCell>
                      <TableCell>{formatDateTime(r.created_at)}</TableCell>
                      <TableCell>{formatDateTime(r.decided_at)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                          {r.status === "approved" ? "Approved" : "Rejected"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
