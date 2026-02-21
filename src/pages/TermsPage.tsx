import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Terms of Service</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5 text-sm text-foreground">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Last updated: February 16, 2026</p>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">1. Service Scope</h2>
          <p>
            OpenPay is a Pi Network-powered payment application. OpenPay is designed for Pi ecosystem payment flows and
            internal OpenPay account operations.
          </p>
          <p>
            OpenPay is not a bank, does not provide banking services, and is not connected to external bank accounts.
            OpenPay is also not an external wallet aggregator and does not support direct transfers to third-party external wallets.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">2. Account Responsibility</h2>
          <p>
            You are responsible for activity on your account, including payments sent, requests created, and security settings.
            You must keep your login credentials and device access secure.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">3. Transaction Finality and Accuracy</h2>
          <p>
            Before sending a payment, you must verify recipient details, amount, and currency. You acknowledge that
            blockchain-related payment flows may be irreversible once completed.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">4. Risk Controls</h2>
          <p>
            OpenPay may monitor for suspicious activity and may limit, suspend, or terminate access for fraud, abuse,
            security threats, policy violations, or legal compliance requirements.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">5. Availability and Changes</h2>
          <p>
            OpenPay may update, improve, or discontinue features at any time. Continued use of the app after updates
            means you accept the revised Terms.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">6. Fees and Network Costs</h2>
          <p>
            OpenPay platform fees may be zero or may change in the future based on product policy. Network-side or
            third-party costs are outside OpenPay platform control.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">7. Contact and Legal</h2>
          <p>
            For legal notices, policy interpretation, or support requests, use the in-app Help Center and Legal pages.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
