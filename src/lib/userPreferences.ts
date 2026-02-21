import { supabase } from "@/integrations/supabase/client";
import type { AppSecuritySettings } from "@/lib/appSecurity";
import type { Json } from "@/integrations/supabase/types";

export interface UserPreferencesRecord {
  hide_balance: boolean;
  usage_agreement_accepted: boolean;
  onboarding_completed: boolean;
  onboarding_step: number;
  reference_code: string | null;
  profile_full_name: string | null;
  profile_username: string | null;
  security_settings: AppSecuritySettings;
  merchant_onboarding_data: Record<string, unknown>;
  qr_print_settings: Record<string, unknown>;
}

const defaultPrefs: UserPreferencesRecord = {
  hide_balance: false,
  usage_agreement_accepted: false,
  onboarding_completed: false,
  onboarding_step: 0,
  reference_code: null,
  profile_full_name: null,
  profile_username: null,
  security_settings: {},
  merchant_onboarding_data: {},
  qr_print_settings: {},
};

const toObjectRecord = (value: Json | null | undefined): Record<string, unknown> => {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

export const loadUserPreferences = async (userId: string): Promise<UserPreferencesRecord> => {
  const { data, error } = await supabase
    .from("user_preferences")
    .select(
      "hide_balance, usage_agreement_accepted, onboarding_completed, onboarding_step, reference_code, profile_full_name, profile_username, security_settings, merchant_onboarding_data, qr_print_settings",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...defaultPrefs };

  return {
    hide_balance: Boolean(data.hide_balance),
    usage_agreement_accepted: Boolean(data.usage_agreement_accepted),
    onboarding_completed: Boolean(data.onboarding_completed),
    onboarding_step: Number.isFinite(data.onboarding_step) ? Number(data.onboarding_step) : 0,
    reference_code: data.reference_code ?? null,
    profile_full_name: data.profile_full_name ?? null,
    profile_username: data.profile_username ?? null,
    security_settings: toObjectRecord(data.security_settings) as AppSecuritySettings,
    merchant_onboarding_data: toObjectRecord(data.merchant_onboarding_data),
    qr_print_settings: toObjectRecord(data.qr_print_settings),
  };
};

export const upsertUserPreferences = async (
  userId: string,
  patch: Partial<UserPreferencesRecord>,
) => {
  const payload = {
    user_id: userId,
    ...patch,
  };

  const { error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
};

export const setAppCookie = (name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 365) => {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
};

export const getAppCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return null;
  return decodeURIComponent(item.slice(prefix.length));
};
