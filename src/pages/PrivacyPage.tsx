import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Privacy Policy</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5 text-sm text-foreground">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Last updated: February 16, 2026</p>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">1. Who We Are</h2>
          <p>
            OpenPay is a Pi Network-powered application focused on Pi payment use cases. OpenPay is not a bank, is not a
            bank account provider, and is not connected to external bank systems or third-party external wallet rails.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">2. Information We Process</h2>
          <p>
            We process account profile data, authentication/session data, wallet balances, transaction records, support
            tickets, and device/app signals needed to operate and protect the service.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">3. Why We Process Data</h2>
          <p>
            We use data to deliver core app functions, secure accounts, detect fraud/abuse, provide notifications,
            troubleshoot issues, and satisfy legal obligations.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">4. Sharing and Disclosure</h2>
          <p>
            OpenPay does not sell personal information. Data is shared only when required for platform operations,
            trusted infrastructure services, legal compliance, or safety/security response.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">5. Notifications and Device Permissions</h2>
          <p>
            If enabled, OpenPay may send in-app notifications and device notifications. On Pi Browser and other supported
            browsers, notification behavior depends on browser/device permission settings and platform capabilities.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">6. Security and Retention</h2>
          <p>
            We use technical and operational safeguards to protect data. Records are retained according to operational,
            security, and legal requirements.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">7. Pi Ecosystem Focus</h2>
          <p>
            OpenPay is fully Pi-focused in product direction and payment architecture. Features for non-Pi rails are not
            part of the current service scope unless explicitly announced by OpenPay.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-base font-bold text-paypal-dark">8. Policy Updates</h2>
          <p>
            We may update this Privacy Policy. The latest effective date is shown at the top of this page.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
