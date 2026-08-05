import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CLASS_SCHEDULES } from "@/lib/attendance-constants";

type ProfileForm = {
  full_name: string;
  birthdate: string;
  email: string;
  course_year: string;
  class_schedule: string;
  id_number: string;
  mobile_number: string;
  address: string;
};

const EMPTY: ProfileForm = {
  full_name: "",
  birthdate: "",
  email: "",
  course_year: "",
  class_schedule: "",
  id_number: "",
  mobile_number: "",
  address: "",
};

export function AccountDialog({
  open,
  onOpenChange,
  userId,
  isSA,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | undefined;
  isSA: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      birthdate: profile.birthdate ?? "",
      email: profile.email ?? "",
      course_year: profile.course_year ?? "",
      class_schedule: profile.class_schedule ?? "",
      id_number: profile.id_number ?? "",
      mobile_number: profile.mobile_number ?? "",
      address: profile.address ?? "",
    });
  }, [profile]);

  const set = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f, ...patch }));

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        birthdate: form.birthdate || null,
        email: form.email.trim(),
        course_year: form.course_year.trim() || null,
        class_schedule: form.class_schedule || null,
        id_number: form.id_number.trim() || null,
        mobile_number: form.mobile_number.trim() || null,
        address: form.address.trim() || null,
      })
      .eq("id", userId);
    if (!error && form.email.trim() && form.email.trim() !== profile?.email) {
      const { error: authError } = await supabase.auth.updateUser({ email: form.email.trim() });
      if (authError) toast.error(authError.message);
      else toast.info("Confirm the change from the link sent to your new email address.");
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(false);
    void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    toast.success("Profile saved");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings &amp; Privacy</DialogTitle>
          <DialogDescription>
            Review and update your personal information and password. Changes are saved securely to
            your account.
          </DialogDescription>
        </DialogHeader>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">Personal Information</CardTitle>
              <CardDescription>Keep your contact details up to date.</CardDescription>
            </div>
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit Profile
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-name">Full Name</Label>
              <Input
                id="acc-name"
                disabled={!editing}
                value={form.full_name}
                maxLength={120}
                onChange={(e) => set({ full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-dob">Date of Birth</Label>
              <Input
                id="acc-dob"
                type="date"
                disabled={!editing}
                value={form.birthdate}
                onChange={(e) => set({ birthdate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-email">Email Address</Label>
              <Input
                id="acc-email"
                type="email"
                disabled={!editing}
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </div>
            {isSA && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="acc-course">Course &amp; Year</Label>
                  <Input
                    id="acc-course"
                    disabled={!editing}
                    value={form.course_year}
                    maxLength={80}
                    onChange={(e) => set({ course_year: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Class Schedule</Label>
                  <Select
                    disabled={!editing}
                    value={form.class_schedule}
                    onValueChange={(v) => set({ class_schedule: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                    <SelectContent>
                      {CLASS_SCHEDULES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-idnum">Student ID Number</Label>
                  <Input
                    id="acc-idnum"
                    disabled={!editing}
                    value={form.id_number}
                    maxLength={40}
                    onChange={(e) => set({ id_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-mobile">Active Mobile Number</Label>
                  <Input
                    id="acc-mobile"
                    disabled={!editing}
                    value={form.mobile_number}
                    maxLength={20}
                    onChange={(e) => set({ mobile_number: e.target.value })}
                  />
                </div>
              </>
            )}
            {editing && (
              <div className="flex gap-2 sm:col-span-2">
                <Button disabled={saving} onClick={saveProfile}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    if (profile) {
                      setForm({
                        full_name: profile.full_name ?? "",
                        birthdate: profile.birthdate ?? "",
                        email: profile.email ?? "",
                        course_year: profile.course_year ?? "",
                        class_schedule: profile.class_schedule ?? "",
                        id_number: profile.id_number ?? "",
                        mobile_number: profile.mobile_number ?? "",
                        address: profile.address ?? "",
                      });
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <ChangePasswordCard defaultEmail={form.email} />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordCard({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setEmail(defaultEmail), [defaultEmail]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirmation do not match");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: current,
    });
    if (signInError) {
      setBusy(false);
      toast.error("Current email or password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>
          Confirm your email and current password before setting a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pw-email">Email Address</Label>
            <Input
              id="pw-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pw-current">Current Password</Label>
            <PasswordInput
              id="pw-current"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw-new">New Password</Label>
            <PasswordInput
              id="pw-new"
              required
              minLength={6}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw-confirm">Confirm New Password</Label>
            <PasswordInput
              id="pw-confirm"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save New Password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
