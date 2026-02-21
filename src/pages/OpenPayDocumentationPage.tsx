import { ArrowLeft, BookOpen, ExternalLink, FileText, KeyRound, Link2, Scale, ShieldCheck, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

const OpenPayDocumentationPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate("/menu")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back to menu"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">OpenPay Documentation</h1>
          <p className="text-xs text-muted-foreground">Professional product and compliance docs</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">OpenPay Platform</p>
        <p className="mt-2 text-sm text-white/90">
          OpenPay is a Web3 wallet and merchant payment stack powered by Pi digital currency, with merchant APIs, checkout links, and virtual card settlement.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="paypal-surface rounded-3xl p-4">
          <Wallet className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Core Wallet Layer</p>
          <p className="mt-1 text-xs text-muted-foreground">Identity, balance management, peer transfers, virtual card controls, and ledger-linked activity.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <KeyRound className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Merchant API Layer</p>
          <p className="mt-1 text-xs text-muted-foreground">Sandbox/live key lifecycle, product catalog, checkout sessions, and payment-link creation.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <Link2 className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Checkout Layer</p>
          <p className="mt-1 text-xs text-muted-foreground">Hosted checkout sessions generated from API calls or payment links, payable via OpenPay virtual card.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Security Model</p>
          <p className="mt-1 text-xs text-muted-foreground">RLS-protected merchant data, scoped keys by mode, and controlled RPC access for payment operations.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Documentation Index</h2>
        </div>
        <div className="grid gap-3">
          <Button variant="outline" className="h-11 justify-between rounded-2xl" onClick={() => navigate("/openpay-api-docs")}>
            OpenPay API Documentation (Third-party Integration)
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-11 justify-between rounded-2xl" onClick={() => navigate("/pi-whitepaper")}>
            OpenPay Whitepaper (Pi-aligned)
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-11 justify-between rounded-2xl" onClick={() => navigate("/pi-mica-whitepaper")}>
            OpenPay MiCA Whitepaper (Pi-aligned)
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-11 justify-between rounded-2xl" onClick={() => navigate("/gdpr")}>
            GDPR and Data Rights
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Compliance Notes</h2>
        </div>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Product disclosures</p>
            <p className="mt-1">Merchants should disclose refund policy, pricing terms, and any regional requirements before payment completion.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Sandbox vs live</p>
            <p className="mt-1">Sandbox is for integration and QA; live mode should be used only after checkout and payment-link flows are validated.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Web3 ecosystem context</p>
            <p className="mt-1">OpenPay documentation references Pi ecosystem publications for network-level context and policy interpretation.</p>
          </div>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Source References</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Official ecosystem references: Pi Whitepaper and Pi MiCA Whitepaper. OpenPay uses these documents as external references for ecosystem context.
        </p>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default OpenPayDocumentationPage;
