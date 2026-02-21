import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const AboutOpenPayPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">About OpenPay</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5 space-y-4 text-sm text-foreground">
        <p className="text-base font-semibold text-paypal-dark">A professional payment experience for Pi users.</p>
        <p>
          OpenPay is built for fast, simple payments between people and businesses. Inside the app, we show a
          stable reference value of <span className="font-semibold">1 Pi = 1 USD</span> for clarity.
        </p>
        <p>
          The platform focuses on Pi-native transfers, requests, and receipts with a clean, auditable experience.
          It is designed for everyday transactions where both parties use OpenPay.
        </p>

        <div>
          <p className="font-semibold text-foreground">What OpenPay supports</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>Secure Pi-auth sign in and on-device security controls.</li>
            <li>Express send, receive via QR, and payment requests.</li>
            <li>Transparent activity history with receipt records.</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-foreground">Current limitations</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>No direct transfers to external banks or third-party wallets.</li>
            <li>Availability depends on Pi infrastructure and supported regions.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border/70 bg-secondary/50 p-3 text-xs text-muted-foreground">
          OpenPay is currently free for supported core features. Future integrations may be introduced based on
          technical and legal availability.
        </div>

        <div className="rounded-2xl border border-paypal-light-blue/40 bg-paypal-light-blue/10 p-3 text-xs text-muted-foreground">
          OpenPay is an independent platform built for the Pi Network ecosystem and is not affiliated with any
          government authority or central bank. OpenPay is powered by the Pi digital currency. For more information,
          visit{" "}
          <a href="https://minepi.com" target="_blank" rel="noreferrer" className="font-semibold text-paypal-blue">
            minepi.com
          </a>
          .
        </div>
      </div>
    </div>
  );
};

export default AboutOpenPayPage;
