import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import dccSeal from "@/assets/dcc-seal.jpg.asset.json";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teachers Attendance Monitoring System — SA & HR Portal" },
      {
        name: "description",
        content:
          "Log teachers attendance by department, room and time as a Student Assistant, and monitor, edit and export the master attendance table as HR.",
      },
      { property: "og:title", content: "Teachers Attendance Monitoring System" },
      {
        property: "og:description",
        content:
          "Role-based attendance logging and HR oversight for campus faculty monitoring.",
      },
    ],
  }),
  component: AuthPage,
});

const PRIVACY_NOTICE =
  "Notice: This system is for authorized Student Assistants (SA) and Human Resources (HR) personnel only. All teacher attendance records are confidential and must be used only for official school purposes. Unauthorized access, sharing, copying, or misuse of any information is strictly prohibited and may result in disciplinary action.";

function PrivacyNotice({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/60 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{PRIVACY_NOTICE}</p>
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="text-xs font-bold leading-snug">
          I have read and agree to this Privacy Notice.
        </Label>
      </div>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, role, loading, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [loginAgreed, setLoginAgreed] = useState(false);
  const [signupAgreed, setSignupAgreed] = useState(false);
  const [signupRole, setSignupRole] = useState("");

  useEffect(() => {
    if (loading || !user) return;
    if (role === "hr") navigate({ to: "/hr", replace: true });
    else if (role === "student_assistant") navigate({ to: "/sa", replace: true });
  }, [loading, user, role, navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Signed in");
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const selectedRole = String(form.get("role") || "");
    if (!selectedRole) {
      toast.error("Please select your role");
      return;
    }
    setBusy(true);
    const email = String(form.get("email")).trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: String(form.get("password")),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Sign up failed");
      return;
    }

    const profile = {
      id: data.user.id,
      full_name: String(form.get("full_name")).trim(),
      birthdate: String(form.get("birthdate")) || null,
      address: String(form.get("address")).trim() || null,
      email,
      username: String(form.get("username")).trim(),
      id_number: String(form.get("id_number") ?? "").trim() || null,
    };

    const [{ error: profileError }, { error: roleError }] = await Promise.all([
      supabase.from("profiles").insert(profile),
      supabase
        .from("user_roles")
        .insert({ user_id: data.user.id, role: selectedRole as "hr" | "student_assistant" }),
    ]);
    setBusy(false);

    if (profileError || roleError) {
      toast.error(profileError?.message ?? roleError?.message ?? "Could not save profile");
      return;
    }
    toast.success("Account created");
    await refresh();
    navigate({ to: selectedRole === "hr" ? "/hr" : "/sa", replace: true });

  }

  return (
    <main className="campus-bg min-h-screen">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <section className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
          <img
            src={dccSeal.url}
            alt="Davao Central College official seal"
            className="h-28 w-28 rounded-full bg-card/80 object-contain p-1 shadow-md lg:h-36 lg:w-36"
          />
          <h1 className="mt-4 text-4xl font-bold uppercase leading-tight text-foreground lg:text-5xl">
            Teachers Attendance Monitoring System
          </h1>
        </section>


        <Card className="self-center shadow-lg">
          <CardHeader>
            <CardTitle>Account Access</CardTitle>
            <CardDescription>Sign in or register your Student Assistant / HR account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Log In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="space-y-4 pt-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <PasswordInput id="login-password" name="password" required />
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-xs font-bold text-primary underline-offset-2 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PrivacyNotice id="login-agree" checked={loginAgreed} onChange={setLoginAgreed} />
                  <Button type="submit" className="w-full" disabled={busy || !loginAgreed}>
                    {busy ? "Please wait…" : "Log In"}
                  </Button>

                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4 pt-4" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input id="full_name" name="full_name" required maxLength={120} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="birthdate">Date of Birth</Label>
                      <Input id="birthdate" name="birthdate" type="date" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select name="role" value={signupRole} onValueChange={setSignupRole}>
                        <SelectTrigger id="role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student_assistant">Student Assistant</SelectItem>
                          <SelectItem value="hr">HR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {signupRole === "student_assistant" && (
                    <div className="space-y-2">
                      <Label htmlFor="id_number">Student Assistant ID Number</Label>
                      <Input id="id_number" name="id_number" required maxLength={40} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea id="address" name="address" rows={2} maxLength={300} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" name="username" required maxLength={40} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <PasswordInput
                      id="signup-password"
                      name="password"
                      required
                      minLength={6}
                    />
                  </div>
                  <PrivacyNotice id="signup-agree" checked={signupAgreed} onChange={setSignupAgreed} />
                  <Button type="submit" className="w-full" disabled={busy || !signupAgreed}>
                    {busy ? "Creating account…" : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
