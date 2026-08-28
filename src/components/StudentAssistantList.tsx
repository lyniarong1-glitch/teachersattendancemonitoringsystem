import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteStudentAssistantAccount } from "@/lib/hr-accounts.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SARow = {
  id: string;
  full_name: string;
  id_number: string | null;
  email: string;
  course: string | null;
  course_year: string | null;
  grade_level: string | null;
  class_schedule: string | null;
  mobile_number: string | null;
  is_active: boolean;
  deactivated_at: string | null;
};

export function StudentAssistantList({ onView }: { onView: (userId: string) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SARow | null>(null);
  const deleteAccount = useServerFn(deleteStudentAssistantAccount);

  const { data: assistants = [], isLoading } = useQuery({
    queryKey: ["sa-accounts"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student_assistant");
      if (rolesError) throw rolesError;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as SARow[];
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, id_number, email, course, course_year, grade_level, class_schedule, mobile_number, is_active, deactivated_at",
        )
        .in("id", ids)
        .order("full_name");
      if (error) throw error;
      return data as SARow[];
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: active, deactivated_at: active ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ["sa-accounts"] });
      toast.success(
        v.active
          ? "Account reactivated — the Student Assistant can sign in again."
          : "Account deactivated — access revoked. All submitted records are kept.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteAccount({ data: { userId: id } }),
    onSuccess: () => {
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["sa-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["all-records"] });
      toast.success("Account deleted. Previously submitted attendance records remain in the system.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assistants;
    return assistants.filter((a) =>
      [a.full_name, a.id_number, a.email, a.course, a.course_year]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [assistants, search]);

  const activeCount = assistants.filter((a) => a.is_active).length;

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle>Student Assistant List</CardTitle>
        <CardDescription>
          {assistants.length} registered · {activeCount} active. Deactivating or deleting an account
          only removes system access — every attendance record they submitted stays in the master
          table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, ID number, email or course"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Course / Year</TableHead>
                <TableHead>Class Schedule</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Loading accounts…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No Student Assistant accounts found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((a) => (
                <TableRow key={a.id} className={a.is_active ? "" : "opacity-70"}>
                  <TableCell>
                    <button
                      className="font-bold underline underline-offset-2"
                      onClick={() => onView(a.id)}
                    >
                      {a.full_name}
                    </button>
                  </TableCell>
                  <TableCell>{a.id_number || "—"}</TableCell>
                  <TableCell>
                    {[a.course ?? a.course_year, a.grade_level].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>{a.class_schedule || "—"}</TableCell>
                  <TableCell className="break-all">{a.email}</TableCell>
                  <TableCell>{a.mobile_number || "—"}</TableCell>
                  <TableCell>
                    {a.is_active ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="destructive">
                        Inactive
                        {a.deactivated_at
                          ? ` · ${new Date(a.deactivated_at).toLocaleDateString()}`
                          : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => onView(a.id)}>
                        Review
                      </Button>
                      <Button
                        size="sm"
                        variant={a.is_active ? "secondary" : "default"}
                        disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ id: a.id, active: !a.is_active })}
                      >
                        {a.is_active ? (
                          <>
                            <UserX className="mr-1 h-3.5 w-3.5" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-1 h-3.5 w-3.5" /> Reactivate
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(a)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.full_name}'s account?</DialogTitle>
            <DialogDescription>
              This permanently removes the sign-in account. Every attendance record and submission
              notice they created stays in the system, still stamped with their name and ID number.
              Choose Deactivate instead if you may need to restore access later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
