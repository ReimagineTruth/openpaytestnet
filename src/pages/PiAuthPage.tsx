import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { setAppCookie } from "@/lib/userPreferences";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";

const PiAuthPage = () => {
  const [piUser, setPiUser] = useState<{ uid: string; username: string } | null>(null);
  const [busyAuth, setBusyAuth] = useState(false);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sdkReady = typeof window !== "undefined" && !!window.Pi;
  const sandbox = String(import.meta.env.VITE_PI_SANDBOX || "false").toLowerCase() === "true";

  const normalizeUsername = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);

  const resolveUniqueUsername = async (baseValue: string, userId: string) => {
    const safeBase = normalizeUsername(baseValue) || `pi_${userId.replace(/-/g, "").slice(0, 12)}`;
    const minBase = safeBase.length < 3 ? `${safeBase}${"x".repeat(3 - safeBase.length)}` : safeBase;

    for (let index = 0; index < 6; index += 1) {
      const suffix = index === 0 ? "" : `_${index}`;
      const maxBaseLength = Math.max(3, 20 - suffix.length);
      const candidate = `${minBase.slice(0, maxBaseLength)}${suffix}`;
      const { data: existing, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", candidate)
        .neq("id", userId)
        .maybeSingle();

      if (error) break;
      if (!existing) return candidate;
    }

    return `${minBase.slice(0, 15)}_${userId.replace(/-/g, "").slice(0, 4)}`;
  };

  const initPi = () => {
    if (!window.Pi || typeof window.Pi.init !== "function" || typeof window.Pi.authenticate !== "function") {
      toast.error("Pi SDK not loaded");
      return false;
    }
    try {
      window.Pi.init({ version: "2.0", sandbox });
      return true;
    } catch {
      toast.error("Pi SDK failed to initialize. Please reopen in Pi Browser.");
      return false;
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const hasIncomingAuthCode = Boolean(
        (searchParams.get("auth_code") || searchParams.get("openpay_code") || searchParams.get("code") || "").trim(),
      );
      if (data.session && !hasIncomingAuthCode) {
        navigate("/dashboard", { replace: true });
      }
    };
    checkSession();
  }, [navigate, searchParams]);

  useEffect(() => {
    const ref = (searchParams.get("ref") || "").trim().toLowerCase();
    if (ref) {
      setAppCookie("openpay_last_ref", ref);
    }
    const incomingCode = (
      searchParams.get("auth_code") ||
      searchParams.get("openpay_code") ||
      searchParams.get("code") ||
      ""
    )
      .trim()
      .toUpperCase();
    if (incomingCode) setAuthorizationCode(incomingCode);
  }, [searchParams]);

  const signInPiBackedAccount = async (piUid: string, piUsername: string, referralCode?: string) => {
    const piEmail = `pi_${piUid}@openpay.local`;
    const piPassword = `OpenPay-Pi-${piUid}-v1!`;
    const piSignupUsername = `pi_${piUid.replace(/-/g, "").slice(0, 16)}`;
    let created = false;

    const doSignIn = async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: piEmail,
        password: piPassword,
      });
      return { session: data.session, error };
    };

    const firstSignIn = await doSignIn();
    if (!firstSignIn.error && firstSignIn.session) return { created };

    const firstSignInMessage = firstSignIn.error?.message?.toLowerCase() || "";
    const accountMissing =
      firstSignInMessage.includes("invalid login credentials") ||
      firstSignInMessage.includes("email not confirmed") ||
      firstSignInMessage.includes("user not found");

    if (accountMissing) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: piEmail,
        password: piPassword,
        options: {
          data: {
            full_name: piUsername,
            username: piSignupUsername,
            referral_code: referralCode,
            pi_uid: piUid,
            pi_username: piUsername,
            pi_connected_at: new Date().toISOString(),
          },
        },
      });

      if (signUpError && !signUpError.message.toLowerCase().includes("already registered")) {
        throw new Error(signUpError.message || "Failed to create Pi account");
      }
      if (!signUpError) created = true;

      const secondSignIn = await doSignIn();
      if (secondSignIn.error || !secondSignIn.session) {
        throw new Error(secondSignIn.error?.message || "Failed to sign in Pi account");
      }
      return { created };
    }

    throw new Error(firstSignIn.error?.message || "Failed to sign in Pi account");
  };

  const verifyPiAccessToken = async (accessToken: string) => {
    const { data, error } = await supabase.functions.invoke("pi-platform", {
      body: { action: "auth_verify", accessToken },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error, "Pi auth verification failed"));

    const payload = data as { success?: boolean; data?: { uid?: string; username?: string }; error?: string } | null;
    if (!payload?.success || !payload.data?.uid) {
      throw new Error(payload?.error || "Pi auth verification failed");
    }

    return {
      uid: String(payload.data.uid),
      username: String(payload.data.username || ""),
    };
  };

  const handlePiAuth = async () => {
    const expectedCode = authorizationCode.trim().toUpperCase();

    if (!initPi() || !window.Pi) return;
    setBusyAuth(true);
    try {
      const referralCode = (searchParams.get("ref") || "").trim().toLowerCase();
      const auth = await window.Pi.authenticate(["username"]);
      const verified = await verifyPiAccessToken(auth.accessToken);
      const username = verified.username || auth.user.username;
      setAppCookie("openpay_last_pi_uid", verified.uid);
      setAppCookie("openpay_last_pi_username", username);

      const signInResult = await signInPiBackedAccount(verified.uid, username, referralCode || undefined);

      // Ensure current authenticated user has latest Pi metadata.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error } = await supabase.auth.updateUser({
          data: {
            pi_uid: verified.uid,
            pi_username: username,
            pi_connected_at: new Date().toISOString(),
          },
        });
        if (error) {
          toast.error(error.message || "Pi linked locally, but profile update failed");
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .maybeSingle();

        const existingName = String(profile?.full_name || "").trim();
        const existingUsername = String(profile?.username || "").trim().toLowerCase();
        const shouldRefreshUsername =
          !existingUsername ||
          existingUsername.startsWith("pi_") ||
          !/^[a-z0-9_]{3,20}$/.test(existingUsername);
        const preferredUsername = shouldRefreshUsername
          ? await resolveUniqueUsername(username || verified.uid, user.id)
          : existingUsername;
        const preferredName = existingName || username || `Pi User ${verified.uid.slice(-6)}`;

        const { error: profileSyncError } = await supabase
          .from("profiles")
          .update({
            full_name: preferredName,
            username: preferredUsername,
          })
          .eq("id", user.id);
        if (profileSyncError) {
          toast.error(profileSyncError.message || "Pi linked, but profile sync failed");
        }

        const { error: accountSyncError } = await supabase.rpc("upsert_my_user_account");
        if (accountSyncError) {
          toast.error(accountSyncError.message || "Pi linked, but account sync failed");
        }

        const needsProfileSetup =
          Boolean(signInResult?.created) ||
          !preferredName.trim() ||
          !preferredUsername.trim() ||
          preferredUsername.startsWith("pi_");

        if (needsProfileSetup) {
          toast.message("Set up your profile to continue");
          navigate("/setup-profile", { replace: true });
          return;
        }

        if (expectedCode) {
          const { data: isMatch, error: verifyError } = await supabase.rpc(
            "verify_my_openpay_authorization_code",
            { p_code: expectedCode }
          );
          if (verifyError) {
            throw new Error(verifyError.message || "Authorization code verification failed");
          }
          if (!isMatch) {
            await supabase.auth.signOut();
            throw new Error("Invalid or expired authorization code. Please request a new code and try again.");
          }
        }
      }

      setPiUser({ uid: verified.uid, username });
      toast.success(`Authenticated as @${username}`);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pi auth failed");
    } finally {
      setBusyAuth(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-paypal-blue to-[#072a7a] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm flex-col justify-center">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-4 h-16 w-16" />
          <p className="mb-1 text-lg font-semibold text-white">OpenPay</p>
          <p className="text-sm font-medium text-white/85">Welcome to OpenPay</p>
        </div>

        <div className="paypal-surface w-full rounded-3xl p-7 shadow-2xl shadow-black/15">
          <div className="mb-4">
            <h1 className="paypal-heading text-xl">Welcome</h1>
          </div>

          <div className="rounded-2xl border border-border/70 bg-white p-3">
            <h2 className="text-base font-semibold text-foreground">Pi Browser</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your Pi account securely with Pi authentication.
            </p>
            {!!searchParams.get("ref") && (
              <p className="mt-1 text-xs text-paypal-blue">
                Referral code detected: {(searchParams.get("ref") || "").trim().toLowerCase()}
              </p>
            )}
            {!sdkReady && (
              <p className="mt-1 text-xs text-destructive">
                Pi SDK is unavailable. Please open this app in Pi Browser.
              </p>
            )}
            <Button
              onClick={handlePiAuth}
              disabled={busyAuth || !sdkReady}
              className="mt-3 h-11 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
            >
              {busyAuth ? "Authenticating..." : sdkReady ? "Authenticate with Pi" : "Open in Pi Browser"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="mt-2 h-11 w-full rounded-2xl"
            >
              <Link to="/sign-in?mode=signin">Use Email Sign In</Link>
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="mt-2 h-11 w-full rounded-2xl"
            >
              <a href="https://openpaylandingpage.vercel.app/" target="_blank" rel="noreferrer">
                Landing Page
              </a>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Use email sign in if you use OpenPay App and OpenPay Desktop Browser. Experience the full-screen experience, notifications, and more.
            </p>
            {piUser && (
              <p className="mt-3 text-sm text-foreground">
                Connected as <span className="font-semibold">@{piUser.username}</span> ({piUser.uid})
              </p>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing, you agree to our <Link to="/terms" className="text-paypal-blue font-medium">Terms</Link> and{" "}
            <Link to="/privacy" className="text-paypal-blue font-medium">Privacy Policy</Link>.
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Learn more: <Link to="/about-openpay" className="text-paypal-blue font-medium">About OpenPay</Link> -{" "}
            <Link to="/legal" className="text-paypal-blue font-medium">Legal</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PiAuthPage;

