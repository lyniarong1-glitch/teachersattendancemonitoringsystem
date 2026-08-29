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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/sa-list")({
  head: () => ({
    meta: [
      { title: "Student Assistant List — Attendance Monitoring" },
      {
        name: "description",
        content:
          "HR directory of all registered Student Assistants with enrollment, personal and address details, plus account activation control.",
      },
      { property: "og:title", content: "Student Assistant List" },
      {
        property: "og:description",
        content: "Review registered Student Assistants and manage their system access.",
      },
    ],
  }),
  component: SaListPage,
});

type SaRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  email: string;
  mobile_number: string | null;
  grade_level: string | null;
  course: string | null;
  course_year: string | null;
  class_schedule: string | null;
  birthdate: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  street: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  is_active: boolean;
  deactivated_at: string | null;
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-bold">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function SaListPage() {
  const { user, role, fullName } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SaRow | null>(null);
  const [confirm, setConfirm] = useState<SaRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sa-directory"],
    enabled: role === "hr",
    refetchOnMount: "always",
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student_assistant");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as SaRow[];
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, id_number, email, mobile_number, grade_level, course, course_year, class_schedule, birthdate, first_name, middle_name, last_name, street, barangay, city, province, is_active, deactivated_at",
        )
        .in("id", ids)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as SaRow[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: next, deactivated_at: next ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["sa-directory"] });
      setConfirm(null);
      setSelected(null);
      toast.success(
        next
          ? "Account reactivated — the Student Assistant can sign in again."
          : "Account deactivated — access removed. All submitted records are kept.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.id_number, r.email, r.course, r.course_year, r.grade_level]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

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

  const address = (r: SaRow) =>
    [r.street, r.barangay, r.city, r.province].filter((v) => v?.trim()).join(", ");

  return (
    <div className="min-h-screen campus-bg">
      <AppHeader name={fullName} role="Human Resources" userId={user?.id} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Student Assistant List</CardTitle>
              <CardDescription>
                {rows.length} registered Student Assistant{rows.length === 1 ? "" : "s"} —{" "}
                {rows.filter((r) => r.is_active).length} active. Deactivating an account only
                removes system access; every attendance record they submitted stays in the system.
              </CardDescription>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID number, email, course…"
              className="sm:max-w-xs"
            />
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-muted-foreground">Loading Student Assistants…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-muted-foreground">No Student Assistants found.</p>
            )}
            {filtered.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-secondary/60 text-left">
                      <th className="p-2 font-bold">Full Name</th>
                      <th className="p-2 font-bold">ID Number</th>
                      <th className="p-2 font-bold">Course &amp; Year</th>
                      <th className="p-2 font-bold">Class Schedule</th>
                      <th className="p-2 font-bold">Email</th>
                      <th className="p-2 font-bold">Status</th>
                      <th className="p-2 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="p-2">
                          <button
                            type="button"
                            className="font-bold underline underline-offset-2"
                            onClick={() => setSelected(r)}
                          >
                            {r.full_name}
                          </button>
                        </td>
                        <td className="p-2">{r.id_number ?? "—"}</td>
                        <td className="p-2">{r.course_year ?? r.course ?? "—"}</td>
                        <td className="p-2">{r.class_schedule ?? "—"}</td>
                        <td className="p-2 break-all">{r.email}</td>
                        <td className="p-2">
                          <Badge variant={r.is_active ? "default" : "destructive"}>
                            {r.is_active ? "Active" : "Deactivated"}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant={r.is_active ? "destructive" : "secondary"}
                            onClick={() => setConfirm(r)}
                          >
                            {r.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.full_name}</DialogTitle>
            <DialogDescription>
              Student Assistant profile · ID {selected?.id_number ?? "—"} ·{" "}
              {selected?.is_active ? "Active account" : "Deactivated account"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wide">Enrollment Information</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Grade Level" value={selected.grade_level} />
                  <Field label="Course" value={selected.course ?? selected.course_year} />
                  <Field label="Class Schedule" value={selected.class_schedule} />
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wide">Personal Information</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="First Name" value={selected.first_name} />
                  <Field label="Middle Name" value={selected.middle_name} />
                  <Field label="Last Name" value={selected.last_name} />
                  <Field label="Date of Birth" value={selected.birthdate} />
                  <Field label="Mobile Number" value={selected.mobile_number} />
                  <Field label="Email Address" value={selected.email} />
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wide">Address</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Street" value={selected.street} />
                  <Field label="Barangay" value={selected.barangay} />
                  <Field label="City" value={selected.city} />
                  <Field label="Province" value={selected.province} />
                </div>
                <p className="text-sm font-bold">{address(selected) || "—"}</p>
              </section>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected && (
              <Button
                variant={selected.is_active ? "destructive" : "secondary"}
                onClick={() => setConfirm(selected)}
              >
                {selected.is_active ? "Deactivate account" : "Reactivate account"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.is_active ? "Deactivate this account?" : "Reactivate this account?"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.is_active
                ? `${confirm?.full_name} will immediately lose access to the system and will not be able to sign in. All attendance records and submissions they already sent remain in the system, unchanged.`
                : `${confirm?.full_name} will be able to sign in and record attendance again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm?.is_active ? "destructive" : "default"}
              disabled={toggleActive.isPending}
              onClick={() =>
                confirm && toggleActive.mutate({ id: confirm.id, next: !confirm.is_active })
              }
            >
              {toggleActive.isPending
                ? "Saving…"
                : confirm?.is_active
                  ? "Yes, deactivate"
                  : "Yes, reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
