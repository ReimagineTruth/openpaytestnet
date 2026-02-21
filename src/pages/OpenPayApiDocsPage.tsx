import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Copy, KeyRound, Link2, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";

const OPENPAY_RPC_BASE = "https://YOUR_SUPABASE_PROJECT.supabase.co/rest/v1/rpc";

const OpenPayApiDocsPage = () => {
  const navigate = useNavigate();
  const [previewTab, setPreviewTab] = useState<"button" | "widget" | "iframe" | "direct" | "qr">("button");
  const sampleLink = useMemo(
    () =>
      typeof window === "undefined"
        ? "https://openpay.example/payment-link/oplink_demo"
        : `${window.location.origin}/payment-link/oplink_demo`,
    [],
  );
  const sampleButtonCode = `<a href="${sampleLink}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#0057d8;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700"><img src="/openpay-o.svg" alt="OpenPay" width="16" height="16" style="display:block;border-radius:999px" />Pay with OpenPay</a>`;
  const sampleWidgetCode = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fbff;font-family:Arial,sans-serif">
    <div style="max-width:360px;margin:0 auto;border:1px solid #d9e6ff;border-radius:16px;padding:20px;background:#fff">
      <p style="margin:0;color:#5c6b82;font-size:12px;letter-spacing:.08em;text-transform:uppercase">OpenPay</p>
      <h3 style="margin:8px 0 0;font-size:24px;color:#10213a">OpenPay Payment</h3>
      <p style="margin:8px 0 16px;color:#5c6b82;font-size:14px">Secure checkout powered by OpenPay</p>
      <a href="${sampleLink}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#0057d8;color:#fff;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:700">Pay now</a>
    </div>
  </body>
</html>`;
  const sampleIframeCode = `<iframe src="${sampleLink}" width="100%" height="720" frameborder="0" style="border:1px solid #d9e6ff;border-radius:12px;max-width:560px;" allow="payment *"></iframe>`;

  const snippets = useMemo(
    () => ({
      createPaymentLink: `curl -X POST "${OPENPAY_RPC_BASE}/create_merchant_payment_link" \\
  -H "apikey: YOUR_SERVICE_OR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_OR_SERVICE_ROLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "p_secret_key": "osk_live_xxx",
    "p_mode": "live",
    "p_link_type": "products",
    "p_title": "OpenPay Order",
    "p_description": "Order payment",
    "p_currency": "USD",
    "p_items": [{"product_id":"PRODUCT_UUID","quantity":1}],
    "p_collect_customer_name": true,
    "p_collect_customer_email": true,
    "p_after_payment_type": "confirmation",
    "p_confirmation_message": "Thanks for your payment."
  }'`,
      createCheckoutSession: `curl -X POST "${OPENPAY_RPC_BASE}/create_merchant_checkout_session" \\
  -H "apikey: YOUR_SERVICE_OR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_OR_SERVICE_ROLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "p_secret_key": "osk_live_xxx",
    "p_mode": "live",
    "p_currency": "USD",
    "p_items": [{"product_id":"PRODUCT_UUID","quantity":2}],
    "p_customer_email": "buyer@example.com",
    "p_customer_name": "Buyer Name"
  }'`,
      createSessionFromLink: `curl -X POST "${OPENPAY_RPC_BASE}/create_checkout_session_from_payment_link" \\
  -H "apikey: YOUR_SERVICE_OR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_OR_SERVICE_ROLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "p_link_token": "oplink_xxx",
    "p_customer_email": "buyer@example.com",
    "p_customer_name": "Buyer Name"
  }'`,
      payWithVirtualCard: `curl -X POST "${OPENPAY_RPC_BASE}/pay_merchant_checkout_with_virtual_card" \\
  -H "apikey: YOUR_SERVICE_OR_ANON_KEY" \\
  -H "Authorization: Bearer BUYER_AUTH_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "p_session_token": "opsess_xxx",
    "p_card_number": "1234123412341234",
    "p_expiry_month": 2,
    "p_expiry_year": 2030,
    "p_cvc": "123",
    "p_note": "Checkout payment"
  }'`,
      merchantTransactions: `curl -X POST "${OPENPAY_RPC_BASE}/get_my_merchant_link_transactions" \\
  -H "apikey: YOUR_SERVICE_OR_ANON_KEY" \\
  -H "Authorization: Bearer MERCHANT_AUTH_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "p_mode": "live",
    "p_payment_link_token": null,
    "p_session_token": null,
    "p_status": "succeeded",
    "p_limit": 100,
    "p_offset": 0
  }'`,
      jsFetch: `const rpc = async (fn, body, token) => {
  const res = await fetch(\`${OPENPAY_RPC_BASE}/\${fn}\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};`,
    }),
    [],
  );

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const Card = ({ title, body }: { title: string; body: string }) => (
    <div className="rounded-2xl border border-border bg-white p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );

  const Snippet = ({ title, code }: { title: string; code: string }) => (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <Button variant="outline" className="h-8 rounded-lg px-2 text-xs" onClick={() => handleCopy(code, title)}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-4">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate("/openpay-documentation")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back to docs"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">OpenPay API Docs</h1>
          <p className="text-xs text-muted-foreground">Third-party integration guide (API key + checkout + links)</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <p className="text-sm font-semibold uppercase tracking-wide">Integration Overview</p>
        <p className="mt-2 text-sm text-white/90">
          External systems can integrate OpenPay by calling Supabase RPC endpoints with merchant secret keys (`osk_*`) and mode (`sandbox`/`live`).
          No extra database migration is required for core API key + checkout + payment-link integration.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Card title="1. Generate API key" body="Create a merchant key from Merchant Portal. Keep `secret_key` server-side only." />
        <Card title="2. Create payment link/session" body="Use `create_merchant_payment_link` or `create_merchant_checkout_session` RPC." />
        <Card title="3. Accept payment" body="Use hosted checkout and complete via OpenPay wallet / virtual card." />
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Step-by-Step Integration Guide</h2>
        </div>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 1: Open merchant portal</p>
            <p className="mt-1">Go to `/merchant-onboarding`, choose sandbox or live mode, and confirm your merchant profile is complete.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 2: Create API key</p>
            <p className="mt-1">Open API keys, create a key for selected mode, and securely store your secret key outside client-side code.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 3: Create products or custom amount link</p>
            <p className="mt-1">In `/payment-links/create`, choose one-time or subscription, set amount, currency, and customer fields.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 4: Generate payment link</p>
            <p className="mt-1">Create the link and open Share tools to choose Button, Widget, iFrame, Direct link, or QR code.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 5: Embed on website or app</p>
            <p className="mt-1">Copy generated code and place it in your site/app. Use iFrame for inline checkout or direct link for social/chat.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 6: Test end-to-end</p>
            <p className="mt-1">Test successful and failed payments in sandbox, then switch to live mode when checkout flow is verified.</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="font-semibold text-foreground">Step 7: Track operations</p>
            <p className="mt-1">Monitor analytics, customer activity, transactions, and notifications from merchant portal pages.</p>
          </div>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Share Method Previews</h2>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-border bg-secondary/20 p-1">
          {([
            ["button", "Button"],
            ["widget", "Widget"],
            ["iframe", "iFrame"],
            ["direct", "Direct link"],
            ["qr", "QR code"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreviewTab(key)}
              className={`rounded-lg px-3 py-2 text-sm ${previewTab === key ? "bg-white font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {previewTab === "button" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">HTML Button Code</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{sampleButtonCode}</code></pre>
            </div>
            <div className="rounded-xl bg-secondary/30 p-6 text-center">
              <a href={sampleLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-[10px] bg-paypal-blue px-6 py-3 font-bold text-white">
                <BrandLogo className="h-4 w-4" />
                Pay with OpenPay
              </a>
            </div>
          </div>
        )}

        {previewTab === "widget" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">Widget HTML</p>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{sampleWidgetCode}</code></pre>
            </div>
            <div className="rounded-xl bg-secondary/20 p-4">
              <div className="mx-auto max-w-sm rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <BrandLogo className="h-5 w-5" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenPay</p>
                </div>
                <p className="text-sm text-muted-foreground">Pay link</p>
                <p className="text-xl font-semibold text-foreground">OpenPay Payment</p>
                <p className="mt-1 text-sm text-muted-foreground">Secure checkout powered by OpenPay</p>
                <button className="mt-4 h-10 w-full rounded-full bg-paypal-blue text-sm font-semibold text-white">Pay now</button>
              </div>
            </div>
          </div>
        )}

        {previewTab === "iframe" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">iFrame Embed Code</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{sampleIframeCode}</code></pre>
            </div>
            <div className="rounded-xl border border-border bg-white p-2">
              <iframe
                src={sampleLink}
                title="OpenPay iFrame sample"
                className="h-[440px] w-full rounded-lg border border-border"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {previewTab === "direct" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">Direct Link</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{sampleLink}</p>
            </div>
            <div className="rounded-xl bg-secondary/20 p-4">
              <p className="text-sm text-muted-foreground">Use direct link for messages, social media, app deep-link pages, or email campaigns.</p>
              <a href={sampleLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-full bg-paypal-blue px-4 py-2 text-sm font-semibold text-white">
                Open payment page
              </a>
            </div>
          </div>
        )}

        {previewTab === "qr" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">QR Code</p>
              <p className="mt-1 text-xs text-muted-foreground">Scan to open payment page on mobile instantly.</p>
            </div>
            <div className="flex justify-center rounded-xl bg-white p-4">
              <QRCodeSVG
                value={sampleLink}
                size={240}
                includeMargin
                level="H"
                imageSettings={{ src: "/openpay-o.svg", width: 42, height: 42, excavate: true }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Authentication Model</h2>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p><span className="font-semibold text-foreground">Publishable key:</span> <code>opk_{"{mode}"}_...</code> (public usage allowed).</p>
          <p><span className="font-semibold text-foreground">Secret key:</span> <code>osk_{"{mode}"}_...</code> (backend/server only).</p>
          <p><span className="font-semibold text-foreground">RPC auth header:</span> <code>Authorization: Bearer ...</code> with user access token or service role token.</p>
          <p><span className="font-semibold text-foreground">Mode:</span> must be <code>sandbox</code> or <code>live</code> in RPC payload.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Core RPC Endpoints</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 pr-3">RPC</th>
                <th className="pb-2 pr-3">Purpose</th>
                <th className="pb-2">Main Inputs</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3 font-mono text-xs">create_merchant_payment_link</td>
                <td className="py-2 pr-3">Create hosted payment link</td>
                <td className="py-2">`p_secret_key`, `p_mode`, `p_link_type`, `p_currency`, `p_items/custom_amount`</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3 font-mono text-xs">create_merchant_checkout_session</td>
                <td className="py-2 pr-3">Create checkout session directly</td>
                <td className="py-2">`p_secret_key`, `p_mode`, `p_currency`, `p_items`</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3 font-mono text-xs">create_checkout_session_from_payment_link</td>
                <td className="py-2 pr-3">Resolve `oplink_*` into `opsess_*`</td>
                <td className="py-2">`p_link_token`, customer name/email</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3 font-mono text-xs">pay_merchant_checkout_with_virtual_card</td>
                <td className="py-2 pr-3">Complete session using OpenPay virtual card</td>
                <td className="py-2">`p_session_token`, card number/expiry/cvc</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3 font-mono text-xs">get_my_merchant_link_transactions</td>
                <td className="py-2 pr-3">Get all merchant link/session transactions with full customer/payment details</td>
                <td className="py-2">`p_mode`, `p_payment_link_token`, `p_session_token`, `p_status`, pagination</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono text-xs">revoke_my_merchant_api_key</td>
                <td className="py-2 pr-3">Disable compromised key</td>
                <td className="py-2">`p_key_id`</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Snippet title="Create Payment Link (cURL)" code={snippets.createPaymentLink} />
        <Snippet title="Create Checkout Session (cURL)" code={snippets.createCheckoutSession} />
        <Snippet title="Create Session from Payment Link (cURL)" code={snippets.createSessionFromLink} />
        <Snippet title="Pay Checkout with Virtual Card (cURL)" code={snippets.payWithVirtualCard} />
        <Snippet title="Get Merchant Transactions (cURL)" code={snippets.merchantTransactions} />
        <Snippet title="Reusable JS Fetch RPC Helper" code={snippets.jsFetch} />
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Hosted URLs</h2>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p><span className="font-semibold text-foreground">Payment link page:</span> <code>/payment-link/{"{oplink_token}"}</code></p>
          <p><span className="font-semibold text-foreground">Checkout page:</span> <code>/merchant-checkout?session={"{opsess_token}"}</code></p>
          <p><span className="font-semibold text-foreground">Merchant dashboard:</span> <code>/merchant-onboarding</code> for key/link analytics and management.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Security + Production Checklist</h2>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>1. Keep <code>osk_*</code> secret keys only in backend environment variables.</p>
          <p>2. Validate mode (<code>sandbox</code> / <code>live</code>) before calling RPC.</p>
          <p>3. Revoke keys immediately if exposed.</p>
          <p>4. Store <code>session_token</code>, <code>transaction_id</code>, and payment status in your app database.</p>
          <p>5. Move to <code>live</code> only after full sandbox QA.</p>
        </div>
      </div>

      <div className="paypal-surface mt-4 rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-paypal-blue" />
          <h2 className="font-semibold text-foreground">Need SQL?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Merchant transaction API is now available via <code>get_my_merchant_link_transactions</code> and the SQL migration has been added.
        </p>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default OpenPayApiDocsPage;
