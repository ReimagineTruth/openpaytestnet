import { ArrowLeft, ExternalLink, FileCheck, Globe, Lock, Scale, ShieldCheck, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

const GDPR_PORTAL_URL = "https://app.prighter.com/portal/16457313501";

const GdprPage = () => {
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
          <h1 className="text-xl font-bold text-paypal-dark">GDPR</h1>
          <p className="text-xs text-muted-foreground">OpenPay privacy and data rights</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">Data Protection</p>
        <p className="mt-2 text-sm text-white/90">
          OpenPay follows a privacy-by-design approach for account security, transaction integrity, and responsible processing of personal data.
        </p>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">What OpenPay Processes</h2>
        </div>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Account and profile data</p>
            <p className="mt-1">Username, display name, avatar, authentication metadata, and account security events.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Payments and merchant operations</p>
            <p className="mt-1">Transaction records, payment link events, checkout metadata, and risk/fraud monitoring signals.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Support and compliance records</p>
            <p className="mt-1">Dispute references, legal requests, and audit logs required for security and regulatory obligations.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="paypal-surface rounded-3xl p-4">
          <Scale className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Lawful Basis</p>
          <p className="mt-1 text-xs text-muted-foreground">Contract performance, legitimate interests, consent where required, and legal obligations.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <Lock className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Security Controls</p>
          <p className="mt-1 text-xs text-muted-foreground">Role-based access, encrypted transport, key management controls, and monitored operational logs.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <UserCheck className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Data Subject Rights</p>
          <p className="mt-1 text-xs text-muted-foreground">Access, correction, deletion, portability, restriction, objection, and consent withdrawal where applicable.</p>
        </div>
        <div className="paypal-surface rounded-3xl p-4">
          <Globe className="h-4 w-4 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">International Transfers</p>
          <p className="mt-1 text-xs text-muted-foreground">When cross-border transfers apply, OpenPay uses appropriate safeguards under applicable data protection law.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Privacy Request Portal</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Use the OpenPay GDPR request portal for access, deletion, or other privacy requests. The portal is hosted by Prighter.
        </p>
        <Button className="mt-3 h-11 w-full rounded-2xl" onClick={() => window.open(GDPR_PORTAL_URL, "_blank")}>
          Open GDPR Request Portal
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          If the portal does not load, enable JavaScript in your browser and try again.
        </p>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default GdprPage;
