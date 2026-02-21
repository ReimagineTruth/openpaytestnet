import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Send, ArrowLeftRight, CircleDollarSign, FileText, Wallet, Activity, HelpCircle, Info, Scale, LogOut, Clapperboard, ShieldAlert, FileCheck, Lock, Users, Store, BookOpen, Download, Megaphone, Smartphone, CreditCard, ShieldCheck, Handshake, Monitor, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { clearAllAppSecurityUnlocks } from "@/lib/appSecurity";
import { canAccessRemittanceMerchant, isRemittanceUiEnabled } from "@/lib/remittanceAccess";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const MenuPage = () => {
  const OPENPAY_APK_URL = "https://mega.nz/file/pFsECZjD#Lwdlo7tjgprWpU-N7UzKOy_aolGk5t4pgzHXA4VLm7M";
  const navigate = useNavigate();
  const remittanceUiEnabled = isRemittanceUiEnabled();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [welcomeClaimedAt, setWelcomeClaimedAt] = useState<string | null>(null);
  const [claimingWelcome, setClaimingWelcome] = useState(false);
  const [hasRemittanceAccess, setHasRemittanceAccess] = useState(false);
  const [canOpenAdminDashboard, setCanOpenAdminDashboard] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const loadWelcomeStatus = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      const normalizedUsername = String(profile?.username || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
      setCanOpenAdminDashboard(normalizedUsername === "openpay" || normalizedUsername === "wainfoundation");
      if (remittanceUiEnabled) {
        setHasRemittanceAccess(canAccessRemittanceMerchant(user.id, profile?.username || null));
      }

      const { data: wallet } = await supabase
        .from("wallets")
        .select("welcome_bonus_claimed_at")
        .eq("user_id", user.id)
        .single();
      setWelcomeClaimedAt(wallet?.welcome_bonus_claimed_at || null);
    };
    loadWelcomeStatus();
  }, [remittanceUiEnabled]);

  const handleInstall = async () => {
    if (!installPrompt) {
      window.open(OPENPAY_APK_URL, "_blank", "noopener,noreferrer");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setCanInstall(choice.outcome === "accepted" ? false : true);
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      return;
    }
    window.open(OPENPAY_APK_URL, "_blank", "noopener,noreferrer");
  };

  const handleLogout = async () => {
    clearAllAppSecurityUnlocks();
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/auth");
  };

  const handleClaimWelcome = async () => {
    setClaimingWelcome(true);
    const { data, error } = await supabase.rpc("claim_welcome_bonus");
    setClaimingWelcome(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const claimed = (data as { claimed?: boolean } | null)?.claimed;
    if (claimed) {
      toast.success("Welcome bonus claimed");
    } else {
      toast.message("Welcome bonus already claimed");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: wallet } = await supabase
      .from("wallets")
      .select("welcome_bonus_claimed_at")
      .eq("user_id", user.id)
      .single();
    setWelcomeClaimedAt(wallet?.welcome_bonus_claimed_at || null);
  };

  const sections = [
    {
      title: "Send and pay",
      items: [
        { icon: Send, label: "Express Send", action: () => navigate("/send") },
        { icon: ArrowLeftRight, label: "Transfer balance", action: () => navigate("/topup") },
      ],
    },
    {
      title: "Get paid",
      items: [
        { icon: CircleDollarSign, label: "Request payment", action: () => navigate("/request-payment") },
        { icon: FileText, label: "Send invoice", action: () => navigate("/send-invoice") },
      ],
    },
    {
      title: "Manage finances",
      items: [
        { icon: Users, label: "User profile", action: () => navigate("/profile") },
        { icon: Wallet, label: "Wallet", action: () => navigate("/dashboard") },
        { icon: Store, label: "Merchant Portal", action: () => navigate("/merchant-onboarding") },
        { icon: Store, label: "Merchant POS", action: () => navigate("/merchant-pos") },
        { icon: HandCoins, label: "A2U App-to-User Payments", action: () => navigate("/a2u-payments") },
        ...(canOpenAdminDashboard
          ? [{ icon: ShieldCheck, label: "Admin Dashboard", action: () => navigate("/admin-dashboard") }]
          : []),
        { icon: CreditCard, label: "OpenPay Virtual Card", action: () => navigate("/virtual-card") },
        { icon: FileText, label: "Payment Link Creator", action: () => navigate("/payment-links/create") },
        ...(remittanceUiEnabled
          ? [{
              icon: Store,
              label: hasRemittanceAccess ? "Remittance merchant center" : "Remittance merchant center (Coming soon)",
              action: () => {
                if (hasRemittanceAccess) {
                  navigate("/remittance-merchant");
                  return;
                }
                toast.message("Coming soon");
              },
              disabled: !hasRemittanceAccess,
              subtitle: hasRemittanceAccess ? "Developer access enabled" : "Under development",
            }]
          : []),
        { icon: ArrowLeftRight, label: "Currency converter", action: () => navigate("/currency-converter") },
        { icon: Activity, label: "Activity", action: () => navigate("/activity") },
        { icon: BookOpen, label: "Public ledger", action: () => navigate("/ledger") },
        { icon: Users, label: "Affiliate referrals", action: () => navigate("/affiliate") },
        { icon: Clapperboard, label: "Pi Ad Network", action: () => navigate("/pi-ads") },
      ],
    },
    {
      title: "Rewards",
      items: [
        {
          icon: CircleDollarSign,
          label: welcomeClaimedAt ? "Welcome bonus claimed" : "Claim $1 welcome bonus",
          action: () => handleClaimWelcome(),
          disabled: Boolean(welcomeClaimedAt) || claimingWelcome,
          subtitle: welcomeClaimedAt ? "Already redeemed" : "One-time reward",
        },
      ],
    },
    {
      title: "Get support",
      items: [
        { icon: ShieldAlert, label: "Disputes", action: () => navigate("/disputes") },
        { icon: HelpCircle, label: "Help Center", action: () => navigate("/help-center") },
        { icon: Megaphone, label: "Announcements", action: () => navigate("/announcements") },
        { icon: Smartphone, label: "OpenPay Official Page", action: () => navigate("/openpay-official") },
        { icon: Smartphone, label: "OpenApp Utility Apps", action: () => navigate("/openapp") },
        { icon: Store, label: "Where to use OpenPay", action: () => navigate("/openpay-guide") },
        { icon: BookOpen, label: "OpenPay Documentation", action: () => navigate("/openpay-documentation") },
        { icon: BookOpen, label: "OpenPay API Docs", action: () => navigate("/openpay-api-docs") },
        { icon: Handshake, label: "Open Partner", action: () => navigate("/open-partner") },
        { icon: FileText, label: "Pi Whitepaper", action: () => navigate("/pi-whitepaper") },
        { icon: FileText, label: "Pi MiCA Whitepaper", action: () => navigate("/pi-mica-whitepaper") },
        { icon: ShieldCheck, label: "GDPR", action: () => navigate("/gdpr") },
        { icon: Info, label: "About OpenPay", action: () => navigate("/about-openpay") },
        { icon: FileCheck, label: "Terms", action: () => navigate("/terms") },
        { icon: Lock, label: "Privacy", action: () => navigate("/privacy") },
        { icon: Scale, label: "Legal", action: () => navigate("/legal") },
      ],
    },
    {
      title: "Install OpenPay",
      items: [
        {
          icon: Monitor,
          label: "Pi Browser",
          action: () => navigate("/openpay-desktop"),
          subtitle: "Pi Browser sign-in",
        },
        {
          icon: Download,
          label: canInstall ? "Install OpenPay" : "Install OpenPay APK",
          action: () => handleInstall(),
          subtitle: "Android APK",
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6">
        <h1 className="paypal-heading mb-5">Menu</h1>
        {sections.map((section) => (
          <div key={section.title} className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h2>
            <div className="paypal-surface overflow-hidden rounded-2xl">
            {section.items.map(({ icon: Icon, label, action, subtitle, disabled }) => (
              <button
                key={label}
                onClick={action}
                className={`flex w-full items-center gap-4 border-b border-border/60 px-3 py-3.5 text-left last:border-b-0 transition ${
                  disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-secondary/60"
                }`}
                disabled={disabled}
              >
                <Icon className="h-5 w-5 text-paypal-blue" />
                <div>
                  <span className="text-foreground font-medium">{label}</span>
                  {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                </div>
              </button>
            ))}
            </div>
          </div>
        ))}

        <button
          onClick={handleLogout}
          className="paypal-surface w-full flex items-center gap-4 rounded-2xl px-3 py-3.5 transition hover:bg-red-50 text-destructive"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default MenuPage;
