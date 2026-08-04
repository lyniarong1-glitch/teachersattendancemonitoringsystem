import { Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function AppHeader({
  name,
  role,
  idNumber,
}: {
  name: string;
  role: string;
  idNumber?: string;
}) {

  const navigate = useNavigate();

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
          <div className="text-right leading-tight">
            <div className="font-medium">{name}</div>
            <div className="text-sidebar-foreground/70">{role}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
