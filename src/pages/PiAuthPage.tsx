import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { setAppCookie } from "@/lib/userPreferences";

const PiAuthPage = () => {
  const [piUser, setPiUser] = useState<{ uid: string; username: string } | null>(null);
  const [busyAuth, setBusyAuth] = useState(false);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sdkReady = typeof window !== "undefined" && !!window.Pi;
  const sandbox = String(import.meta.env.VITE_PI_SANDBOX || "false").toLowerCase() === "true";

  const initPi = () => {
    if (!window.Pi) {
      toast.error("Pi SDK not loaded");
      return false;
    }
    window.Pi.init({ version: "2.0", sandbox });
    return true;
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate("/dashboard", { replace: true });
      }
    };
    checkSession();
  }, [navigate]);

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
    if (!firstSignIn.error && firstSignIn.session) return;

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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/pi-platform`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({ action: "auth_verify", accessToken }),
    });

    const payload = await res.json();
    if (!res.ok || !payload?.success || !payload.data?.uid) {
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
          .single();

        const needsProfileSetup =
          Boolean(signInResult?.created) ||
          !profile?.full_name?.trim() ||
          !profile?.username?.trim() ||
          profile.username.startsWith("pi_");

        if (needsProfileSetup) {
          toast.message("Set up your profile to continue");
          navigate("/setup-profile", { replace: true });
          return;
        }

        if (expectedCode) {
          const { data: isMatch, error: verifyError } = await (supabase as any).rpc(
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
              disabled={busyAuth}
              className="mt-3 h-11 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
            >
              {busyAuth ? "Authenticating..." : "Authenticate with Pi"}
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

