import { ArrowLeft, BookOpen, ExternalLink, Network, ShieldCheck, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

const PI_WHITEPAPER_URL = "https://minepi.com/white-paper/";

const PiWhitepaperPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate("/openpay-documentation")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">OpenPay Whitepaper</h1>
          <p className="text-xs text-muted-foreground">Pi-aligned architecture and utility model</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">Platform Thesis</p>
        <p className="mt-2 text-sm text-white/90">
          OpenPay is designed as a practical Web3 payments platform that converts wallet utility into merchant-ready checkout and payment-link workflows.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="paypal-surface rounded-3xl p-4">
          <Wallet className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">User Utility</p>
          <p className="mt-1 text-xs text-muted-foreground">Balance custody, transfer primitives, and virtual card spend for real checkout use cases.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <Network className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Merchant Utility</p>
          <p className="mt-1 text-xs text-muted-foreground">API keys, products, payment links, and hosted checkout sessions with sandbox/live mode separation.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Trust Utility</p>
          <p className="mt-1 text-xs text-muted-foreground">Strong access boundaries, auditable events, and policy-aware product disclosures.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">OpenPay Whitepaper Outline</h2>
        </div>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">1. Mission and scope</p>
            <p className="mt-1">Build reliable digital payment infrastructure for people and merchants in the Pi-powered Web3 economy.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">2. Architecture</p>
            <p className="mt-1">Wallet layer, merchant layer, checkout layer, and compliance layer, each with clear ownership and controls.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">3. Value flows</p>
            <p className="mt-1">User-to-user transfers, merchant collection via checkout, and payment-link conversion to completed transactions.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">4. Policy and governance</p>
            <p className="mt-1">Risk controls, dispute handling, and legal/consumer disclosures for production payment operations.</p>
          </div>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <p className="text-sm text-muted-foreground">
          For ecosystem-level context and canonical Pi network statements, consult the official Pi Whitepaper.
        </p>
        <Button className="mt-3 h-11 w-full rounded-2xl" onClick={() => window.open(PI_WHITEPAPER_URL, "_blank")}>
          Open Official Pi Whitepaper
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default PiWhitepaperPage;
