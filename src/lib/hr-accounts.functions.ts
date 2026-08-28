import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently removes a Student Assistant's login account.
 * Attendance records and submission notifications are preserved: their
 * submitted_by column is set to NULL by the database while the submitter's
 * name and ID number remain stamped on every row.
 */
export const deleteStudentAssistantAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: hrRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "hr")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!hrRole) throw new Error("Only HR accounts can remove Student Assistant accounts.");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account here.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (targetRole?.role !== "student_assistant") {
      throw new Error("Only Student Assistant accounts can be removed.");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
