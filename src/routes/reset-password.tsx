import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Teachers Attendance Monitoring System" },
      {
        name: "description",
        content:
          "Set a new password for your Student Assistant or HR account on the Teachers Attendance Monitoring System.",
      },
      { property: "og:title", content: "Reset Password — Teachers Attendance Monitoring System" },
      {
        property: "og:description",
        content: "Securely set a new password after email verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    toast.success("Password successfully changed.");
  }

  return (
    <main className="campus-bg flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Create New Password</CardTitle>
          <CardDescription>
            {done
              ? "Your password has been updated."
              : "Open this page from the verification link sent to your email, then choose a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm font-bold text-foreground">
                Password successfully changed. You can now log in with your new password.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/", replace: true })}>
                Back to Login
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput id="password" name="password" minLength={6} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <PasswordInput id="confirm" name="confirm" minLength={6} />
              </div>
              {error && <p className="text-sm font-bold text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Reset Password"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/", replace: true })}
              >
                Back to Login
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
