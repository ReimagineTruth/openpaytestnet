import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJson = (raw: string) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, paymentId, txid, accessToken, adId, payment } = await req.json();
    if (!action || typeof action !== "string") {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    // auth_verify does NOT require a Supabase session — the user is logging in
    if (action === "auth_verify") {
      if (!accessToken || typeof accessToken !== "string") {
        return jsonResponse({ error: "Missing accessToken" }, 400);
      }

      const piResponse = await fetch("https://api.minepi.com/v2/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = parseJson(await piResponse.text());
      if (!piResponse.ok) {
        console.error("Pi auth_verify failed", piResponse.status, data);
        return jsonResponse({ error: "Pi auth verification failed", status: piResponse.status, data }, 400);
      }

      const uid = typeof data.uid === "string" ? data.uid : null;
      const username = typeof data.username === "string" ? data.username : null;
      if (!uid) {
        return jsonResponse({ error: "Pi auth response missing uid" }, 400);
      }

      return jsonResponse({
        success: true,
        data: { uid, username },
      });
    }

    // All other actions require a valid Supabase session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Missing auth token" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("PI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "PI_API_KEY is not configured" }, 500);

    if (action === "ad_verify") {
      if (!adId || typeof adId !== "string") {
        return jsonResponse({ error: "Missing adId" }, 400);
      }

      const piResponse = await fetch(`https://api.minepi.com/v2/ads_network/status/${adId}`, {
        method: "GET",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });

      const data = parseJson(await piResponse.text());
      if (!piResponse.ok) {
        return jsonResponse({ error: "Pi ad verification failed", status: piResponse.status, data }, 400);
      }

      const mediatorAckStatus =
        typeof data.mediator_ack_status === "string" ? data.mediator_ack_status : null;
      const rewarded = mediatorAckStatus === "granted";

      return jsonResponse({ success: true, rewarded, data });
    }

    if (action === "a2u_config_status") {
      const hasApiKey = Boolean(apiKey);
      const hasValidationKey = Boolean(Deno.env.get("PI_VALIDATION_KEY"));
      const hasWalletPrivateSeed = Boolean(Deno.env.get("PI_WALLET_PRIVATE_SEED"));
      const hasWalletPublicAddress = Boolean(Deno.env.get("PI_WALLET_PUBLIC_ADDRESS"));
      return jsonResponse({
        success: true,
        data: {
          hasApiKey,
          hasValidationKey,
          hasWalletPrivateSeed,
          hasWalletPublicAddress,
        },
      });
    }

    if (action === "a2u_create") {
      if (!payment || typeof payment !== "object") {
        return jsonResponse({ error: "Missing payment payload" }, 400);
      }

      const body = payment as Record<string, unknown>;
      const amount = Number(body.amount);
      const uid = typeof body.uid === "string" ? body.uid.trim() : "";
      const memo = typeof body.memo === "string" ? body.memo.trim() : "";

      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: "Invalid payment.amount" }, 400);
      }
      if (!uid) {
        return jsonResponse({ error: "Missing payment.uid" }, 400);
      }
      if (!memo) {
        return jsonResponse({ error: "Missing payment.memo" }, 400);
      }

      const piResponse = await fetch("https://api.minepi.com/v2/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = parseJson(await piResponse.text());
      if (!piResponse.ok) {
        return jsonResponse({ error: "Pi A2U create failed", status: piResponse.status, data }, 400);
      }

      return jsonResponse({ success: true, data });
    }

    if (action === "a2u_incomplete") {
      const piResponse = await fetch("https://api.minepi.com/v2/payments/incomplete_server_payments", {
        method: "GET",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });

      const data = parseJson(await piResponse.text());
      if (!piResponse.ok) {
        return jsonResponse({ error: "Pi incomplete payments fetch failed", status: piResponse.status, data }, 400);
      }

      return jsonResponse({ success: true, data });
    }

    if (!paymentId || typeof paymentId !== "string") {
      return jsonResponse({ error: "Missing paymentId" }, 400);
    }

    const endpointBase = `https://api.minepi.com/v2/payments/${paymentId}`;
    let endpoint = endpointBase;
    let method: "GET" | "POST" = "POST";
    let body: Record<string, unknown> | undefined;

    if (action === "approve" || action === "payment_approve" || action === "a2u_approve") {
      endpoint = `${endpointBase}/approve`;
    } else if (action === "complete" || action === "payment_complete" || action === "a2u_complete") {
      endpoint = `${endpointBase}/complete`;
      if (txid && typeof txid === "string") body = { txid };
    } else if (action === "cancel" || action === "payment_cancel" || action === "a2u_cancel") {
      endpoint = `${endpointBase}/cancel`;
    } else if (action === "get" || action === "payment_get" || action === "a2u_get") {
      endpoint = endpointBase;
      method = "GET";
    } else {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    const piResponse = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = parseJson(await piResponse.text());
    if (!piResponse.ok) {
      return jsonResponse({ error: "Pi payment API call failed", status: piResponse.status, data }, 400);
    }

    return jsonResponse({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
