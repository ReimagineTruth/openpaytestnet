import { ArrowLeft, ExternalLink, FileText, Scale, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

const PI_MICA_WHITEPAPER_URL =
  "https://minepi.com/wp-content/uploads/2025/11/MiCA-Whitepaper-Pi-1.pdf";

const PiMicaWhitepaperPage = () => {
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
          <h1 className="text-xl font-bold text-paypal-dark">OpenPay MiCA Whitepaper</h1>
          <p className="text-xs text-muted-foreground">Policy and compliance alignment</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">Regulatory Readiness</p>
        <p className="mt-2 text-sm text-white/90">
          OpenPay documents controls for merchant onboarding, payment integrity, and customer disclosures, aligned with Pi ecosystem MiCA references.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="paypal-surface rounded-3xl p-4">
          <Scale className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Policy Domains</p>
          <p className="mt-1 text-xs text-muted-foreground">Consumer disclosures, operational risk controls, and payment process transparency.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Operational Controls</p>
          <p className="mt-1 text-xs text-muted-foreground">Sandbox/live split, key revocation, account-scoped data policies, and transaction traceability.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">OpenPay MiCA Documentation Outline</h2>
        </div>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">1. Merchant responsibilities</p>
            <p className="mt-1">Price transparency, customer information requirements, and pre-payment disclosures for checkout flows.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">2. Product controls</p>
            <p className="mt-1">Access management for API keys, product lifecycle controls, and mode-specific integration safety.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">3. Incident and dispute handling</p>
            <p className="mt-1">Operational playbooks for failed/expired sessions, payment issues, and user dispute escalation.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">4. Data and privacy obligations</p>
            <p className="mt-1">Data minimization, purpose limitation, and rights handling under GDPR-aligned practices.</p>
          </div>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <p className="text-sm font-semibold text-foreground">Important note</p>
        </div>
        <p className="text-sm text-muted-foreground">
          OpenPay uses Pi documentation as ecosystem references. Merchants remain responsible for local legal and regulatory compliance in their operating jurisdictions.
        </p>
        <Button className="mt-3 h-11 w-full rounded-2xl" onClick={() => window.open(PI_MICA_WHITEPAPER_URL, "_blank")}>
          Open Official Pi MiCA Whitepaper PDF
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default PiMicaWhitepaperPage;
