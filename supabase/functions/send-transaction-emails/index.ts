import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "OpenPay <noreply@openpay.app>";
    const jobKey = Deno.env.get("EMAIL_DISPATCHER_SECRET") || "";

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Server configuration error");
    if (!resendApiKey) throw new Error("Missing RESEND_API_KEY");
    if (!jobKey) throw new Error("Missing EMAIL_DISPATCHER_SECRET");

    const inboundJobKey = req.headers.get("x-job-key") || "";
    if (inboundJobKey !== jobKey) return jsonResponse({ error: "Unauthorized job key" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const requestPayload: unknown = await req.json().catch(() => ({}));
    const requestLimit =
      typeof requestPayload === "object" && requestPayload !== null && "limit" in requestPayload
        ? Number((requestPayload as { limit?: number }).limit)
        : 25;
    const limit = Math.min(Math.max(Number.isFinite(requestLimit) ? requestLimit : 25, 1), 100);

    const { data: jobs, error: jobsError } = await supabase
      .from("email_notifications_outbox")
      .select("id, to_email, subject, body, attempts")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (jobsError) throw jobsError;
    if (!jobs?.length) return jsonResponse({ ok: true, sent: 0, failed: 0, pending: 0 });

    let sent = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [job.to_email],
            subject: job.subject,
            text: String(job.body || ""),
          }),
        });

        if (!sendRes.ok) {
          const errText = await sendRes.text();
          throw new Error(`Resend error: ${errText}`);
        }

        const { error: updateErr } = await supabase
          .from("email_notifications_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: Number(job.attempts || 0) + 1,
            last_error: null,
          })
          .eq("id", job.id);
        if (updateErr) throw updateErr;
        sent += 1;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Unknown send error";
        await supabase
          .from("email_notifications_outbox")
          .update({
            status: "failed",
            attempts: Number(job.attempts || 0) + 1,
            last_error: errorMessage,
          })
          .eq("id", job.id);
        failed += 1;
      }
    }

    const { count: pending } = await supabase
      .from("email_notifications_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return jsonResponse({ ok: true, sent, failed, pending: pending || 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 400);
  }
});
