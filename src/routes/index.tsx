import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GraduationCap, ClipboardCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function AuthPage() {
  const navigate = useNavigate();
  const { user, role, loading, refresh } = useSession();
  const [busy, setBusy] = useState(false);

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
        <section className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-7 w-7" />
            <span className="text-sm font-bold uppercase tracking-[0.2em]">
              Campus Operations
            </span>
          </div>
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
                    <Input id="login-password" name="password" type="password" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
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
                      <Select name="role">
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
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
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
