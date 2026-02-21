import { useNavigate } from "react-router-dom";
import { ArrowLeft, Megaphone } from "lucide-react";

const AnnouncementsPage = () => {
  const navigate = useNavigate();

  const announcements = [
    {
      title: "OpenPay Feature Rollout (Full Platform)",
      date: "Feb 20, 2026",
      body:
        "OpenPay now includes: Pi-auth and email sign-in, Express Send, Receive QR, request payment, invoices, contacts, merchant portal, merchant checkout links, POS mode, API keys, analytics, virtual card checkout, remittance merchant tools, public ledger, and admin dashboard tools.",
    },
    {
      title: "Transaction Email Notifications Enabled",
      date: "Feb 20, 2026",
      body:
        "OpenPay now uses user email for transaction notifications. Users will receive email alerts for sent and received payments (plus in-app notifications).",
    },
    {
      title: "Welcome to OpenPay",
      date: "Feb 16, 2026",
      body: "OpenPay is live with Pi-auth sign-in, Express Send, Receive QR, payment requests, and secure activity history.",
    },
    {
      title: "Public Ledger Updates",
      date: "Feb 16, 2026",
      body: "The public ledger now shows only Pi-auth account transactions and hides record IDs for safety.",
    },
  ];

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate("/menu")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back to menu"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">Announcements</h1>
          <p className="text-xs text-muted-foreground">Product updates and important notices.</p>
        </div>
      </div>

      <div className="space-y-4">
        {announcements.map((item) => (
          <div key={item.title} className="paypal-surface rounded-3xl p-5">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-paypal-blue" />
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>
            <p className="mt-3 text-sm text-foreground">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementsPage;
