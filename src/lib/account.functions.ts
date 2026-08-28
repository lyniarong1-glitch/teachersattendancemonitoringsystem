import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** HR-only: remove a Student Assistant account. Attendance records are preserved. */
export const deleteStudentAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data?.userId || typeof data.userId !== "string") throw new Error("A user is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isHr, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "hr",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isHr) throw new Error("Only HR personnel can delete Student Assistant accounts");
    if (data.userId === context.userId) throw new Error("Use Delete Account to remove your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (targetError) throw new Error(targetError.message);
    if (!target?.some((r) => r.role === "student_assistant")) {
      throw new Error("That account is not a Student Assistant");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
