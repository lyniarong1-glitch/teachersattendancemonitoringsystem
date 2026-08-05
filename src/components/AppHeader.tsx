import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "@/components/AccountDialog";

export function AppHeader({
  name,
  role,
  userId,
  isSA,
}: {
  name: string;
  role: string;
  userId?: string | undefined;
  isSA?: boolean;
}) {
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="no-print border-b border-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-sidebar-primary" />
          <span className="font-serif text-lg font-bold uppercase tracking-wide">
            Teachers Attendance Monitoring System
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-right leading-tight hover:bg-sidebar-accent/40"
            title="Settings & Privacy"
          >
            <Settings className="h-4 w-4 opacity-70" />
            <span>
              <span className="block font-bold underline underline-offset-2">{name}</span>
              <span className="block text-sidebar-foreground/70">{role}</span>
            </span>
          </button>
          <Button size="sm" variant="secondary" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        userId={userId}
        isSA={!!isSA}
      />
    </header>
  );
}
