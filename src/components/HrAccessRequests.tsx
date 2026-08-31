import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Pending HR access requests — only an existing HR officer can approve them. */
export function HrAccessRequests() {
  const queryClient = useQueryClient();

  const { data: requests = [] } = useQuery({
    queryKey: ["hr-access-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_access_requests")
        .select("id, full_name, email, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (approve) {
        const { error } = await supabase.rpc("approve_hr_request", { _request_id: id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hr_access_requests")
          .update({ status: "rejected", decided_at: new Date().toISOString() })
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

  if (requests.length === 0) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Pending HR Access Requests</CardTitle>
        <CardDescription>
          New HR sign-ups cannot access the system until you approve them here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="font-bold">{r.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{r.email}</p>
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
        ))}
      </CardContent>
    </Card>
  );
}
