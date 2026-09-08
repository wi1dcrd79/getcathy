import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side account bootstrap: creates/links the company + profile for the
 * signed-in user and rotates the single-device session marker.
 * Runs entirely on the server; the browser never performs initialization.
 */
export const bootstrapAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { error } = await supabase.rpc("bootstrap_current_user");
    if (error) throw new Error(error.message);

    await supabase.rpc("rotate_session_token", {
      _token: crypto.randomUUID(),
    } as never);

    return { ok: true };
  });
