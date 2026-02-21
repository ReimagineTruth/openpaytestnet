import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/BrandLogo";
import {
  clearAppSecurityUnlock,
  hasAnyAppSecurityMethod,
  isAppSecurityUnlocked,
  loadAppSecuritySettings,
  saveAppSecuritySettings,
  markAppSecurityUnlocked,
  hashSecret,
  verifyBiometricCredential,
} from "@/lib/appSecurity";
import { loadUserPreferences } from "@/lib/userPreferences";

const PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/sign-in",
  "/signin",
  "/signup",
  "/ledger",
  "/admin-mrwain",
  "/terms",
  "/privacy",
  "/about-openpay",
  "/legal",
  "/help-center",
]);

const AppSecurityGate = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [locked, setLocked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountLabel, setAccountLabel] = useState("Secure Account");
  const [settings, setSettings] = useState(() => ({} as ReturnType<typeof loadAppSecuritySettings>));

  const hasPin = Boolean(settings.pinHash);
  const hasPassword = Boolean(settings.passwordHash);
  const hasBiometric = Boolean(settings.biometricEnabled && settings.biometricCredentialId);
  const primaryButtonClass = "h-11 w-full rounded-2xl bg-paypal-blue text-white font-semibold hover:bg-[#004dc5] disabled:bg-paypal-blue/45";
  const darkButtonClass = "h-11 w-full rounded-2xl bg-paypal-dark text-white font-semibold hover:bg-paypal-dark/90 disabled:bg-paypal-dark/45 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100";
  const softButtonClass = "h-11 w-full rounded-2xl border border-paypal-light-blue/70 bg-white text-paypal-dark font-semibold hover:bg-[#f2f7ff] dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-secondary";

  const shouldSkipPath = useMemo(() => {
    if (location.pathname.startsWith("/admin")) return true;
    return PUBLIC_PATHS.has(location.pathname);
  }, [location.pathname]);
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  useEffect(() => {
    const check = async () => {
      setError("");
      if (shouldSkipPath) {
        setLocked(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLocked(false);
        return;
      }

      const currentUserId = user.id;
      setUserId(currentUserId);
      const fallbackLabel = user.phone || user.email || "Secure Account";
      setAccountLabel(fallbackLabel);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", currentUserId)
          .maybeSingle();
        if (profile?.username) {
          setAccountLabel(`@${profile.username}`);
        }
      } catch {
        // keep fallback label
      }
      let loaded = loadAppSecuritySettings(currentUserId);
      if (!hasAnyAppSecurityMethod(loaded)) {
        try {
          const prefs = await loadUserPreferences(currentUserId);
          if (hasAnyAppSecurityMethod(prefs.security_settings)) {
            loaded = prefs.security_settings;
            saveAppSecuritySettings(currentUserId, loaded);
          }
        } catch {
          // Keep local-only behavior if preference table is unavailable.
        }
      }
      setSettings(loaded);

      if (!hasAnyAppSecurityMethod(loaded)) {
        setLocked(false);
        return;
      }

      if (isAppSecurityUnlocked(currentUserId)) {
        setLocked(false);
        return;
      }

      setLocked(true);
    };

    check();
  }, [shouldSkipPath, location.pathname]);

  const unlockSuccess = () => {
    if (!userId) return;
    markAppSecurityUnlocked(userId);
    setLocked(false);
    setPin("");
    setPassword("");
    setError("");
  };

  const handleUnlockWithPin = async () => {
    if (!settings.pinHash) return;
    setBusy(true);
    const hashed = await hashSecret(pin);
    setBusy(false);
    if (hashed !== settings.pinHash) {
      setError("Invalid PIN.");
      return;
    }
    unlockSuccess();
  };

  const handleUnlockWithPassword = async () => {
    if (!settings.passwordHash) return;
    setBusy(true);
    const hashed = await hashSecret(password);
    setBusy(false);
    if (hashed !== settings.passwordHash) {
      setError("Invalid security password.");
      return;
    }
    unlockSuccess();
  };

  const handleUnlockWithBiometric = async () => {
    if (!settings.biometricCredentialId) return;
    setBusy(true);
    setError("");
    try {
      await verifyBiometricCredential(settings.biometricCredentialId);
      unlockSuccess();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Biometric unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (userId) clearAppSecurityUnlock(userId);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!locked) return null;

  return (
    <div
      className="openpay-lock-scroll fixed inset-0 z-[100] overflow-y-auto bg-gradient-to-b from-paypal-blue to-[#072a7a] text-white dark:from-slate-950 dark:to-slate-900"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <style>{`
        .openpay-lock-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-7 pt-10">
        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <BrandLogo className="h-10 w-10" />
            <h1 className="text-4xl font-bold tracking-tight">OpenPay</h1>
          </div>
          <p className="mt-6 text-4xl font-semibold">{timeGreeting}</p>
          <div className="mx-auto mt-4 flex h-12 w-full max-w-xs items-center justify-center rounded-full border border-white/20 bg-paypal-dark/25 px-4 shadow-inner shadow-paypal-dark/35 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="truncate text-2xl font-semibold tracking-wide">{accountLabel}</p>
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-[#d9e7ff] bg-[#fdfefe] px-5 py-6 text-paypal-dark shadow-2xl shadow-paypal-dark/25 dark:border-border dark:bg-card dark:text-foreground dark:shadow-black/45">
          <div className="mb-4 h-1.5 w-24 rounded-full bg-paypal-blue/80 dark:bg-paypal-blue" />
          {hasPin && (
            <div>
              <p className="text-center text-2xl font-semibold">Enter your MPIN</p>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="Enter PIN"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="mt-4 h-12 rounded-2xl border-paypal-light-blue/70 bg-[#edf3ff] text-center text-lg dark:border-border dark:bg-secondary dark:text-foreground"
              />
              <div className="mt-3 flex justify-center gap-2">
                {[0, 1, 2, 3].map((dot) => (
                  <span
                    key={dot}
                    className={`h-2.5 w-2.5 rounded-full border ${pin.length > dot ? "border-paypal-blue bg-paypal-blue" : "border-paypal-light-blue bg-transparent"}`}
                  />
                ))}
              </div>
              <Button
                disabled={busy || !pin.trim()}
                onClick={handleUnlockWithPin}
                className={`mt-4 ${primaryButtonClass}`}
              >
                {busy ? "Unlocking..." : "Unlock with MPIN"}
              </Button>
            </div>
          )}

          {hasPassword && (
            <div className={hasPin ? "mt-5" : ""}>
              <p className="mb-1 text-sm font-medium text-paypal-dark/75 dark:text-muted-foreground">Security Password</p>
              <Input
                type="password"
                placeholder="Enter security password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 rounded-2xl border-paypal-light-blue/70 bg-[#f8fbff] dark:border-border dark:bg-secondary dark:text-foreground"
              />
              <Button
                disabled={busy || !password.trim()}
                onClick={handleUnlockWithPassword}
                className={`mt-2 ${primaryButtonClass}`}
              >
                {busy ? "Unlocking..." : "Unlock with Password"}
              </Button>
            </div>
          )}

          {hasBiometric && (
            <Button
              disabled={busy}
              onClick={handleUnlockWithBiometric}
              className={`mt-4 ${darkButtonClass}`}
            >
              Use Face ID / Fingerprint
            </Button>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button
            onClick={handleLogout}
            className={`mt-4 ${softButtonClass}`}
          >
            Log Out
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-white/85 dark:text-slate-300">Never share your MPIN, password, or OTP with anyone.</p>

        <div className="mt-auto flex items-center justify-center gap-4 pt-8 text-base font-semibold">
          <button
            onClick={() => navigate("/help-center")}
            className="rounded-full border border-white/25 bg-paypal-dark/20 px-4 py-2 text-white/95 hover:bg-paypal-dark/35 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-800"
          >
            Help Center
          </button>
          <button
            onClick={() => navigate("/help-center?topic=forgot-mpin")}
            className="rounded-full border border-white/25 bg-paypal-dark/20 px-4 py-2 text-white/95 hover:bg-paypal-dark/35 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-800"
          >
            Forgot MPIN?
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppSecurityGate;
