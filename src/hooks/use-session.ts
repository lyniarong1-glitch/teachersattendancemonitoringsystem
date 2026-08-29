import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student_assistant" | "hr";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(true);

  const hydrate = useCallback(async (nextUser: User | null) => {
    if (!activeRef.current) return;
    setUser(nextUser);
    if (!nextUser) {
      setRole(null);
      setFullName("");
      setLoading(false);
      return;
    }
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", nextUser.id).maybeSingle(),
      supabase.from("profiles").select("full_name, is_active").eq("id", nextUser.id).maybeSingle(),
    ]);
    if (!activeRef.current) return;
    // Deactivated accounts keep their submitted records but lose system access.
    if (profile && profile.is_active === false) {
      toast.error("This account has been deactivated by HR. Please contact the HR office.");
      await supabase.auth.signOut();
      if (!activeRef.current) return;
      setUser(null);
      setRole(null);
      setFullName("");
      setLoading(false);
      return;
    }
    setRole((roleRow?.role as AppRole) ?? null);
    setFullName(profile?.full_name ?? nextUser.email ?? "");
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await hydrate(data.user ?? null);
  }, [hydrate]);

  useEffect(() => {
    activeRef.current = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrate(session?.user ?? null);
    });

    void supabase.auth.getSession().then(({ data }) => hydrate(data.session?.user ?? null));

    return () => {
      activeRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrate]);

  return { user, role, fullName, loading, refresh };
}

