import { createServerFn } from "@tanstack/react-start";

/**
 * Resolves a login identifier (username or email) to the account email address.
 * Usernames are not credentials — this only maps a handle to the email used by
 * Supabase Auth so users can sign in / reset their password with a username.
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => ({
    identifier: String(input?.identifier ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.identifier) throw new Error("Please enter your username or email.");
    if (data.identifier.includes("@")) return { email: data.identifier.toLowerCase() };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", data.identifier)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile?.email) throw new Error("No account found with that username.");
    return { email: profile.email };
  });
