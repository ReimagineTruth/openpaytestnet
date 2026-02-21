import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  FileText,
  HandCoins,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Utensils,
} from "lucide-react";

const OpenPayGuidePage = () => {
  const navigate = useNavigate();

  const merchantFlows = [
    {
      icon: QrCode,
      title: "Counter QR Checkout",
      description: "Display your OpenPay QR at cashier or table for instant in-person payment collection.",
    },
    {
      icon: ArrowLeftRight,
      title: "Remote Payment Links",
      description: "Send payment requests to customers on chat or social apps and collect remotely.",
    },
    {
      icon: FileText,
      title: "Invoices and Records",
      description: "Issue invoices, track paid status, and keep your payment logs organized.",
    },
    {
      icon: BookOpen,
      title: "Activity and Ledger",
      description: "Review transparent payment history and receipt details for accountability.",
    },
    {
      icon: ShieldCheck,
      title: "Safer Operations",
      description: "Use app security options, disputes, and verification checks for business protection.",
    },
    {
      icon: HandCoins,
      title: "Simple Merchant Growth",
      description: "Combine fast checkout, trust records, and referral tools to grow repeat customers.",
    },
  ];

  const businessTypes = [
    {
      icon: Utensils,
      title: "Food and Beverage",
      examples: "Cafes, restaurants, kiosks, bakeries, street food counters.",
    },
    {
      icon: Store,
      title: "Retail and Local Shops",
      examples: "Clothing, accessories, beauty, mini marts, and specialty stores.",
    },
    {
      icon: Smartphone,
      title: "Digital and Service Sellers",
      examples: "Freelancers, creators, online products, courses, subscriptions.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#e9eef6] pb-12">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/menu")}
              className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-paypal-blue">Merchant Route</p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="paypal-pill bg-paypal-blue text-white transition hover:bg-paypal-blue/90"
          >
            Open App
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-br from-paypal-blue via-[#005fc9] to-[#1587ff] p-6 text-white shadow-2xl shadow-[#0a4eb8]/25 md:p-10">
          <div className="absolute -right-20 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-sky-200/30 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">For OpenPay Merchants</p>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl md:text-6xl">
                Accept payments
                <br />
                fast and clear.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
                OpenPay merchant route helps you collect payments in-store and online with QR checkout, requests,
                invoices, and clean activity records.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate("/merchant-onboarding")}
                  className="paypal-pill bg-white font-semibold text-paypal-blue transition hover:bg-slate-100"
                >
                  Start Merchant Setup
                </button>
                <button
                  onClick={() => navigate("/receive")}
                  className="paypal-pill border border-white/70 bg-transparent text-white transition hover:bg-white/10"
                >
                  Open Receive QR
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/35 bg-white/12 p-4 backdrop-blur">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Checkout</p>
                  <p className="mt-1 text-lg font-bold">QR + Counter Flow</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Collection</p>
                  <p className="mt-1 text-lg font-bold">Request + Invoice</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Tracking</p>
                  <p className="mt-1 text-lg font-bold">Activity + Ledger</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Protection</p>
                  <p className="mt-1 text-lg font-bold">Disputes + Security</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-paypal-blue" />
            <h2 className="paypal-heading">Merchant Tools</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {merchantFlows.map(({ icon: Icon, title, description }) => (
              <article key={title} className="paypal-surface rounded-3xl p-4">
                <Icon className="h-5 w-5 text-paypal-blue" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="paypal-surface rounded-3xl p-5">
            <h2 className="text-xl font-bold text-paypal-dark">Business Types Supported</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-1">
              {businessTypes.map(({ icon: Icon, title, examples }) => (
                <div key={title} className="rounded-2xl bg-secondary/60 p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-paypal-blue" />
                    <p className="font-semibold text-foreground">{title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{examples}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/40 bg-gradient-to-b from-[#e7f2ff] to-[#f7fbff] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paypal-blue">Merchant Checklist</p>
            <h3 className="mt-2 text-lg font-bold text-paypal-dark">Launch in 4 Steps</h3>
            <div className="mt-3 space-y-2 text-sm text-paypal-dark">
              <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-paypal-blue" /> Complete Profile and store identity.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-paypal-blue" /> Set up Receive QR for in-store payments.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-paypal-blue" /> Use Request Money for remote orders.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-paypal-blue" /> Track transactions in Activity and Ledger.</p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/50 bg-paypal-dark p-6 text-white">
          <h2 className="text-2xl font-bold">Start selling with OpenPay</h2>
          <p className="mt-2 text-sm text-white/80">
            Move from setup to live checkout quickly with OpenPay merchant flows.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => navigate("/merchant-onboarding")} className="paypal-pill bg-white text-paypal-dark">
              Merchant Onboarding
            </button>
            <button onClick={() => navigate("/receive")} className="paypal-pill border border-white/60 bg-transparent">
              Generate Payment QR
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default OpenPayGuidePage;
