import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type FxApiPayload = {
  rates?: Record<string, number | string>;
  result?: string;
  success?: boolean;
  base?: string;
};

type WiseRateItem = {
  source?: string;
  target?: string;
  rate?: number | string;
};

const extractRates = (payload: FxApiPayload): Record<string, number> => {
  const raw = payload.rates;
  if (!raw || typeof raw !== "object") {
    throw new Error("FX API payload missing rates");
  }

  const parsed: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const code = key.toUpperCase();
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    parsed[code] = rate;
  }

  if (!Object.keys(parsed).length) {
    throw new Error("FX API returned no valid rates");
  }

  return parsed;
};

const fetchWiseRates = async (token: string): Promise<Record<string, number>> => {
  // Wise Platform endpoint for mid-market rates.
  const response = await fetch("https://api.wise.com/v1/rates?source=USD", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Wise API failed (${response.status})`);
  }

  const payload = (await response.json()) as WiseRateItem[];
  if (!Array.isArray(payload)) {
    throw new Error("Wise API payload is not an array");
  }

  const parsed: Record<string, number> = { USD: 1 };
  for (const item of payload) {
    if (String(item.source || "").toUpperCase() !== "USD") continue;
    const target = String(item.target || "").toUpperCase();
    const rate = Number(item.rate);
    if (!target || !Number.isFinite(rate) || rate <= 0) continue;
    parsed[target] = rate;
  }

  if (!Object.keys(parsed).length) {
    throw new Error("Wise API returned no valid rates");
  }

  return parsed;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const fxSources = [
      "https://open.er-api.com/v6/latest/USD",
      "https://api.frankfurter.app/latest?from=USD",
      "https://api.exchangerate.host/latest?base=USD",
    ];
    const wiseToken = Deno.env.get("WISE_API_TOKEN");

    let lastError = "Unable to fetch exchange rates";
    let rates: Record<string, number> | null = null;
    let source = "";

    if (wiseToken) {
      try {
        rates = await fetchWiseRates(wiseToken);
        source = "https://api.wise.com/v1/rates?source=USD";
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Wise API request failed";
      }
    }

    for (const url of fxSources) {
      if (rates) break;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastError = `FX source failed: ${url} (${response.status})`;
          continue;
        }

        const payload = (await response.json()) as FxApiPayload;
        const extracted = extractRates(payload);
        rates = extracted;
        source = url;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "FX source request failed";
      }
    }

    if (!rates) {
      return jsonResponse({ error: lastError }, 502);
    }

    // Enforce product rule.
    rates.USD = 1;
    rates.PI = 1;

    const { data, error } = await supabase.rpc("apply_usd_exchange_rates", { p_rates: rates });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      success: true,
      updated: Number(data || 0),
      source,
      base: "USD",
      pi_to_usd: 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
