import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Globe, Handshake, Rocket, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

const BUSINESS_TYPES = [
  "E-commerce",
  "Retail",
  "Travel",
  "Hospitality",
  "Digital services",
  "Gaming",
  "Marketplace",
  "Education",
  "NGO / Non-profit",
  "Other",
];

const INTEGRATION_TYPES = [
  "Checkout integration",
  "Payment links",
  "Virtual card settlement",
  "Marketplace payouts",
  "Strategic partnership",
  "Reseller / agency",
];

const OpenPartnerPage = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    country: "",
    website_url: "",
    business_type: "",
    integration_type: "",
    estimated_monthly_volume: "",
    use_case_summary: "",
    message: "",
  });

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.contact_email.trim()) {
      toast.error("Company name, contact name, and contact email are required");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to submit a partnership request");
      navigate("/auth");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("open_partner_leads").insert({
      requester_user_id: user.id,
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim().toLowerCase(),
      country: form.country.trim() || null,
      website_url: form.website_url.trim() || null,
      business_type: form.business_type.trim() || null,
      integration_type: form.integration_type.trim() || null,
      estimated_monthly_volume: form.estimated_monthly_volume.trim() || null,
      use_case_summary: form.use_case_summary.trim(),
      message: form.message.trim() || null,
      status: "new",
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Partnership request sent. OpenPay team will contact you.");
    setForm({
      company_name: "",
      contact_name: "",
      contact_email: "",
      country: "",
      website_url: "",
      business_type: "",
      integration_type: "",
      estimated_monthly_volume: "",
      use_case_summary: "",
      message: "",
    });
  };

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate("/menu")} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">Open Partner</h1>
          <p className="text-xs text-muted-foreground">Integrate OpenPay in any country</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">Global Web3 Payments</p>
        <p className="mt-2 text-sm text-white/90">
          OpenPay is powered by Pi digital currency. We support global partners who want to integrate wallet payments, checkout, payment links, and virtual card flows into real businesses.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="paypal-surface rounded-2xl p-4">
          <Globe className="h-5 w-5 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Cross-border ready</p>
          <p className="mt-1 text-xs text-muted-foreground">Accept OpenPay flows across countries for e-commerce, SaaS, and digital services.</p>
        </div>
        <div className="paypal-surface rounded-2xl p-4">
          <Rocket className="h-5 w-5 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Fast integration</p>
          <p className="mt-1 text-xs text-muted-foreground">Use merchant API keys, products, and payment links to launch quickly.</p>
        </div>
        <div className="paypal-surface rounded-2xl p-4">
          <ShieldCheck className="h-5 w-5 text-paypal-blue" />
          <p className="mt-2 text-sm font-semibold text-foreground">Secure by default</p>
          <p className="mt-1 text-xs text-muted-foreground">RLS and scoped mode keys (sandbox/live) keep merchant data isolated.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Handshake className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Example partnership models</h2>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>1. E-commerce stores using OpenPay checkout for product payments.</p>
          <p>2. Agencies embedding OpenPay payment links for client billing.</p>
          <p>3. SaaS platforms accepting recurring or one-off payments through OpenPay APIs.</p>
          <p>4. Travel, hospitality, and education businesses integrating global wallet acceptance.</p>
          <p>5. Web3 marketplaces connecting OpenPay for settlements and virtual-card spend.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <h2 className="mb-3 font-semibold text-foreground">Apply for integration / partnership</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Company name *"
            value={form.company_name}
            onChange={(e) => updateField("company_name", e.target.value)}
          />
          <Input
            placeholder="Contact name *"
            value={form.contact_name}
            onChange={(e) => updateField("contact_name", e.target.value)}
          />
          <Input
            placeholder="Contact email *"
            type="email"
            value={form.contact_email}
            onChange={(e) => updateField("contact_email", e.target.value)}
          />
          <Input
            placeholder="Country"
            value={form.country}
            onChange={(e) => updateField("country", e.target.value)}
          />
          <Input
            placeholder="Website URL"
            value={form.website_url}
            onChange={(e) => updateField("website_url", e.target.value)}
          />
          <Input
            placeholder="Estimated monthly volume (e.g. $50,000)"
            value={form.estimated_monthly_volume}
            onChange={(e) => updateField("estimated_monthly_volume", e.target.value)}
          />
          <Input
            list="openpay-business-types"
            placeholder="Business type"
            value={form.business_type}
            onChange={(e) => updateField("business_type", e.target.value)}
          />
          <datalist id="openpay-business-types">
            {BUSINESS_TYPES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <Input
            list="openpay-integration-types"
            placeholder="Integration type"
            value={form.integration_type}
            onChange={(e) => updateField("integration_type", e.target.value)}
          />
          <datalist id="openpay-integration-types">
            {INTEGRATION_TYPES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
        <Textarea
          className="mt-3 min-h-[110px]"
          placeholder="Use case summary (what you want to build with OpenPay)"
          value={form.use_case_summary}
          onChange={(e) => updateField("use_case_summary", e.target.value)}
        />
        <Textarea
          className="mt-3 min-h-[96px]"
          placeholder="Message (optional)"
          value={form.message}
          onChange={(e) => updateField("message", e.target.value)}
        />
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 h-11 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
        >
          {submitting ? "Submitting..." : "Submit partnership request"}
        </Button>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default OpenPartnerPage;
