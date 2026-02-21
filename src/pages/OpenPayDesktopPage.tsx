import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type UserAccount = {
  account_number: string;
  account_name: string;
  account_username: string;
};

type IssuedCode = {
  authorization_code: string;
  expires_at: string;
};

const OpenPayDesktopPage = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  const fetchAuthorizationCode = async (forceNew: boolean) => {
    const { data, error } = await (supabase as any).rpc("issue_my_openpay_authorization_code", {
      p_force_new: forceNew,
    });
    if (error) {
      throw new Error(error.message || "Failed to issue authorization code");
    }

    const row = Array.isArray(data) ? (data[0] as IssuedCode | undefined) : (data as IssuedCode | null);
    const code = String(row?.authorization_code || "").trim().toUpperCase();
    if (!code) {
      throw new Error("Authorization code unavailable");
    }
    setAuthorizationCode(code);
  };

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      const { data } = await (supabase as any).rpc("upsert_my_user_account");
      setAccount((data || null) as UserAccount | null);
      await fetchAuthorizationCode(false);
      setLoading(false);
    };

    void load().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to load Pi Browser sign-in");
      setLoading(false);
    });
  }, [navigate]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleRefreshCode = async () => {
    setRefreshingCode(true);
    try {
      await fetchAuthorizationCode(true);
      toast.success("New authorization code issued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh authorization code");
    } finally {
      setRefreshingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (!authorizationCode) return;
    try {
      await navigator.clipboard.writeText(authorizationCode);
      toast.success("Authorization code copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleUseCodeForAuth = () => {
    if (!authorizationCode) {
      toast.error("Authorization code is not available yet");
      return;
    }
    navigate(`/auth?auth_code=${encodeURIComponent(authorizationCode)}`);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      toast.message("Install prompt not available on this browser.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setCanInstall(false);
      setInstallPrompt(null);
      toast.success("OpenPay install started");
    }
  };

  const accountLabel = useMemo(() => {
    if (!account?.account_username) return "OpenPay account";
    return `@${account.account_username}`;
  }, [account?.account_username]);

  if (loading) {
    return <div className="min-h-screen bg-background px-4 pt-6 text-sm text-muted-foreground">Loading Pi Browser sign-in...</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 pb-12 pt-4">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/menu")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Pi Browser</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5">
        <div className="text-center">
          <BrandLogo className="mx-auto h-16 w-16" />
          <p className="mt-3 text-3xl font-bold text-foreground">Sign in through the mobile app</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use this one-time authorization code in Pi Browser/mobile auth to connect the same Pi account.
          </p>
          <p className="mt-1 text-sm text-paypal-blue">{accountLabel}</p>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Authorization Code</p>
          <p className="mt-2 font-mono text-5xl font-bold tracking-wider text-foreground">{authorizationCode || "-"}</p>
          <p className="mt-2 text-sm text-muted-foreground">Waiting for authorization...</p>
          <p className="mt-1 text-xs font-medium text-paypal-blue">Do not share your code with anyone.</p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              disabled={refreshingCode}
              onClick={handleRefreshCode}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {refreshingCode ? "Refreshing..." : "Obtain another code"}
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={handleCopyCode}>
              <Copy className="mr-2 h-4 w-4" />
              Copy code
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border p-4 text-sm text-foreground">
          <p>1. Open OpenPay on desktop or mobile.</p>
          <p>2. Tap sign in and authenticate with Pi.</p>
          <p>3. Enter this authorization code to verify the same account.</p>
          <p>4. Only continue if the code is from your own active session.</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="h-10 rounded-xl bg-paypal-blue text-white hover:bg-[#004dc5]" onClick={handleUseCodeForAuth}>
            Log In With This Code
          </Button>
          <Button variant="outline" className="h-10 rounded-xl" onClick={handleCopyCode}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Code
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            disabled={!canInstall}
            onClick={handleInstall}
          >
            <Download className="mr-2 h-4 w-4" />
            {canInstall ? "Install OpenPay App" : "Install Not Available"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OpenPayDesktopPage;
