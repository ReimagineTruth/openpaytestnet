import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  BookOpen,
  CircleDollarSign,
  Clapperboard,
  FileText,
  HandCoins,
  Megaphone,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";

const OpenPayOfficialPage = () => {
  const navigate = useNavigate();

  const coreFeatures = [
    {
      icon: ArrowLeftRight,
      title: "Express Send and Transfer",
      description: "Send Pi instantly, move balance quickly, and keep payments simple for everyday use.",
    },
    {
      icon: QrCode,
      title: "QR Receive and Request Payment",
      description: "Get paid in-person with QR or remotely with payment requests and links.",
    },
    {
      icon: FileText,
      title: "Invoices and Receipts",
      description: "Send invoices, track paid status, and keep clean records for personal and business use.",
    },
    {
      icon: BookOpen,
      title: "Activity and Public Ledger",
      description: "Review transparent payment history with auditable records and receipt details.",
    },
    {
      icon: CircleDollarSign,
      title: "Currency Converter",
      description: "View value conversions clearly while OpenPay keeps a stable in-app Pi reference experience.",
    },
    {
      icon: ShieldCheck,
      title: "Security and Disputes",
      description: "Use Pi-auth sign in, device security controls, and dispute tools for safer transactions.",
    },
  ];

  const growthFeatures = [
    { icon: Store, title: "Merchant setup", subtitle: "Onboard your shop, service, or creator business quickly." },
    { icon: HandCoins, title: "Affiliate referrals", subtitle: "Grow your network and expand OpenPay usage." },
    { icon: Clapperboard, title: "Pi Ad Network", subtitle: "Promote offers and attract recurring buyers." },
    { icon: Megaphone, title: "Announcements", subtitle: "Stay updated with the latest OpenPay news." },
    { icon: Bell, title: "Notifications", subtitle: "Get real-time payment and account updates." },
    { icon: Sparkles, title: "Welcome bonus", subtitle: "Eligible users can claim the one-time welcome reward." },
  ];

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/menu")}
              className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
              aria-label="Back to menu"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-paypal-blue">OpenPay Official</p>
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
        <section className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-br from-paypal-blue via-[#0060cc] to-[#0086ff] p-6 text-white shadow-2xl shadow-[#0a4eb8]/25 md:p-10">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-sky-200/30 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">The OpenPay App</p>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl md:text-6xl">
                Pay and get paid
                <br />
                fast and secure.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
                OpenPay is a mobile payment landing experience for Pi users and merchants. It combines fast checkout,
                request flows, transparent records, and modern security in one place.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate("/auth")}
                  className="paypal-pill bg-white font-semibold text-paypal-blue transition hover:bg-slate-100"
                >
                  Get Started
                </button>
                <button
                  onClick={() => navigate("/openpay-guide")}
                  className="paypal-pill border border-white/70 bg-transparent text-white transition hover:bg-white/10"
                >
                  For Merchants
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/35 bg-white/12 p-4 backdrop-blur">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Primary wallet</p>
                  <p className="mt-1 text-lg font-bold">OpenPay Balance</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Instant flow</p>
                  <p className="mt-1 text-lg font-bold">QR + Express Send</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Business tools</p>
                  <p className="mt-1 text-lg font-bold">Invoices + Requests</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/75">Trust layer</p>
                  <p className="mt-1 text-lg font-bold">Ledger + Receipts</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-paypal-blue" />
            <h2 className="paypal-heading">Everything OpenPay supports</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map(({ icon: Icon, title, description }) => (
              <article key={title} className="paypal-surface rounded-3xl p-4">
                <Icon className="h-5 w-5 text-paypal-blue" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="paypal-surface rounded-3xl p-5">
            <h2 className="text-xl font-bold text-paypal-dark">Built for personal and business payments</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use OpenPay for retail checkout, food services, freelancers, digital products, and local merchants.
              OpenPay is optimized for Pi-native transactions where both sides use OpenPay.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-foreground sm:grid-cols-2">
              <p className="rounded-xl bg-secondary/70 px-3 py-2">Profile and business identity setup</p>
              <p className="rounded-xl bg-secondary/70 px-3 py-2">Remote sales via request money</p>
              <p className="rounded-xl bg-secondary/70 px-3 py-2">Counter payments with receive QR</p>
              <p className="rounded-xl bg-secondary/70 px-3 py-2">Record keeping with activity history</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/40 bg-gradient-to-b from-[#e7f2ff] to-[#f7fbff] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paypal-blue">Current scope</p>
            <h3 className="mt-2 text-lg font-bold text-paypal-dark">Pi-native focus</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              OpenPay currently does not support direct transfers to external banks or third-party wallets. Availability
              can depend on Pi infrastructure and supported regions.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-paypal-dark">
              <Wallet className="h-4 w-4 text-paypal-blue" />
              1 Pi = 1 USD stable reference in-app
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="paypal-heading mb-4">Growth and engagement tools</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {growthFeatures.map(({ icon: Icon, title, subtitle }) => (
              <article key={title} className="paypal-surface rounded-3xl p-4">
                <Icon className="h-5 w-5 text-paypal-blue" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/50 bg-paypal-dark p-6 text-white">
          <h2 className="text-2xl font-bold">Start using OpenPay today</h2>
          <p className="mt-2 text-sm text-white/80">
            Sign in with Pi-auth, set your profile, and begin sending or receiving payments in minutes.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => navigate("/auth")} className="paypal-pill bg-white text-paypal-dark">
              Log In
            </button>
            <button onClick={() => navigate("/help-center")} className="paypal-pill border border-white/60 bg-transparent">
              Help and FAQ
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default OpenPayOfficialPage;
