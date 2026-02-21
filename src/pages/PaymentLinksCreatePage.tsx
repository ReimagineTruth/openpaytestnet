import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Copy, ExternalLink, FileText, Link2, Menu, MessageCircle, Plus, ShoppingCart, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SplashScreen from "@/components/SplashScreen";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Mode = "sandbox" | "live";
type LinkType = "products" | "custom_amount";
type ShareTab = "button" | "widget" | "iframe" | "direct" | "qr";

type Product = {
  id: string;
  product_name: string;
  unit_amount: number;
  currency: string;
  is_active: boolean;
};

type PaymentLinkRow = {
  id: string;
  link_token: string;
  key_mode: Mode;
  link_type: LinkType;
  title: string;
  currency: string;
  custom_amount: number | null;
  is_active: boolean;
  created_at: string;
};

const PURE_PI_ICON_URL = "https://i.ibb.co/BV8PHjB4/Pi-200x200.png";

const PaymentLinksCreatePage = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const navigate = useNavigate();
  const { currencies } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [merchantUserId, setMerchantUserId] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showMenuSelection, setShowMenuSelection] = useState(false);

  const [mode, setMode] = useState<Mode>("sandbox");
  const [type, setType] = useState<LinkType>("products");
  const [secretKey, setSecretKey] = useState("");
  const [title, setTitle] = useState("OpenPay Payment");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [customAmount, setCustomAmount] = useState("");
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});

  const [collectName, setCollectName] = useState(true);
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectPhone, setCollectPhone] = useState(false);
  const [collectAddress, setCollectAddress] = useState(false);

  const [afterPaymentType, setAfterPaymentType] = useState<"confirmation" | "redirect">("confirmation");
  const [confirmationMessage, setConfirmationMessage] = useState("Thanks for your payment.");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [callToAction, setCallToAction] = useState("Pay");

  const [billingType, setBillingType] = useState<"one_time" | "subscription">("one_time");
  const [coverPlatformFee, setCoverPlatformFee] = useState(false);
  const [coverProcessingFee, setCoverProcessingFee] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState("1");
  const [repeatUnit, setRepeatUnit] = useState<"day" | "week" | "month" | "year">("month");

  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");
  const [shareLinkTitle, setShareLinkTitle] = useState("OpenPay Payment");
  const [shareTab, setShareTab] = useState<ShareTab>("button");
  const [buttonStyle, setButtonStyle] = useState<"default" | "soft" | "dark">("default");
  const [buttonSize, setButtonSize] = useState<"small" | "medium" | "large">("medium");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDeleteLink, setPendingDeleteLink] = useState<PaymentLinkRow | null>(null);

  const loadPaymentLinks = async (userId: string) => {
    const { data } = await db
      .from("merchant_payment_links")
      .select("id, link_token, key_mode, link_type, title, currency, custom_amount, is_active, created_at")
      .eq("merchant_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setPaymentLinks((data || []) as PaymentLinkRow[]);
  };

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setMerchantUserId(user.id);

      const [{ data: profile }, { data: list }] = await Promise.all([
        db.from("merchant_profiles").select("default_currency").eq("user_id", user.id).maybeSingle(),
        db
          .from("merchant_products")
          .select("id, product_name, unit_amount, currency, is_active")
          .eq("merchant_user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      ]);

      const { count: unreadCount } = await supabase
        .from("app_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (profile?.default_currency) setCurrency(String(profile.default_currency).toUpperCase());
      setProducts((list || []) as Product[]);
      setUnreadNotifications(Number(unreadCount || 0));
      await loadPaymentLinks(user.id);
      setLoading(false);
    };

    void boot();
  }, [navigate]);

  const filteredProducts = useMemo(
    () => products.filter((p) => p.currency.toUpperCase() === currency.toUpperCase() && p.is_active),
    [products, currency],
  );
  const currencyChoices = useMemo(() => {
    const map = new Map<string, { code: string; name: string; flag: string }>();
    currencies.forEach((item) => {
      const code = (item.code || "").toUpperCase();
      if ((code !== "PI" && code.length !== 3) || map.has(code)) return;
      map.set(code, { code, name: item.name || code, flag: item.flag || "PI" });
    });
    if (!map.has("PI")) {
      map.set("PI", { code: "PI", name: "Pure Pi", flag: "PI" });
    }
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.code === "PI") return -1;
      if (b.code === "PI") return 1;
      return a.code.localeCompare(b.code);
    });
    return list;
  }, [currencies]);
  const getPiCodeLabel = (code: string) => (code === "PI" ? "PI" : `PI ${code}`);

  const previewTotal = useMemo(() => {
    if (type === "custom_amount") return Number(customAmount || 0);
    return filteredProducts.reduce((sum, p) => sum + Number((selectedQty[p.id] || 0) * Number(p.unit_amount || 0)), 0);
  }, [type, customAmount, filteredProducts, selectedQty]);

  const displayAmount = Number(previewTotal || 0).toFixed(2);

  const handleCopy = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const formatLinkUrl = (token: string) =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/payment-link/${encodeURIComponent(token)}`;

  const formatCreatedDate = (raw: string) => {
    try {
      return new Date(raw).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return raw;
    }
  };

  const formatLinkAmountLabel = (link: PaymentLinkRow) => {
    if (link.link_type === "custom_amount" && Number(link.custom_amount || 0) > 0) {
      return `${link.currency} ${Number(link.custom_amount || 0).toFixed(2)} one-time`;
    }
    return `${link.currency} variable amount`;
  };

  const escapeHtml = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const shareButtonHtmlCode = useMemo(
    () =>
      `<a href="${createdUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:${buttonStyle === "dark" ? "#0b1f3b" : buttonStyle === "soft" ? "#4b7dd1" : "#0057d8"};color:#fff;padding:${buttonSize === "small" ? "8px 16px" : buttonSize === "large" ? "14px 28px" : "12px 24px"};border-radius:10px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif"><img src="/openpay-o.svg" alt="OpenPay" width="16" height="16" style="display:block;border-radius:999px" />Pay with OpenPay</a>`,
    [createdUrl, buttonStyle, buttonSize],
  );
  const shareButtonBg = useMemo(
    () => (buttonStyle === "dark" ? "#0b1f3b" : buttonStyle === "soft" ? "#4b7dd1" : "#0057d8"),
    [buttonStyle],
  );
  const shareButtonPadding = useMemo(
    () => (buttonSize === "small" ? "8px 16px" : buttonSize === "large" ? "14px 28px" : "12px 24px"),
    [buttonSize],
  );
  const qrImageSettings = useMemo(
    () => ({
      src: "/openpay-o.svg",
      width: 42,
      height: 42,
      excavate: true,
    }),
    [],
  );

  const shareButtonReactCode = useMemo(
    () =>
      `export default function OpenPayButton() {\n  return (\n    <a\n      href="${createdUrl}"\n      target="_blank"\n      rel="noopener noreferrer"\n      style={{\n        display: "inline-flex",\n        alignItems: "center",\n        gap: "8px",\n        background: "${buttonStyle === "dark" ? "#0b1f3b" : buttonStyle === "soft" ? "#4b7dd1" : "#0057d8"}",\n        color: "#fff",\n        padding: "${buttonSize === "small" ? "8px 16px" : buttonSize === "large" ? "14px 28px" : "12px 24px"}",\n        borderRadius: "10px",\n        textDecoration: "none",\n        fontWeight: 700,\n      }}\n    >\n      <img src="/openpay-o.svg" alt="OpenPay" width={16} height={16} style={{ borderRadius: 999 }} />\n      Pay with OpenPay\n    </a>\n  );\n}`,
    [createdUrl, buttonStyle, buttonSize],
  );

  const shareWidgetHtmlCode = useMemo(
    () =>
      `<!doctype html>\n<html>\n  <body style="margin:0;padding:24px;font-family:Arial,sans-serif;background:#f8fbff">\n    <div style="max-width:360px;margin:0 auto;border:1px solid #d9e6ff;border-radius:16px;padding:20px;background:#fff">\n      <p style="margin:0;color:#5c6b82;font-size:12px;letter-spacing:.08em;text-transform:uppercase">OpenPay</p>\n      <h3 style="margin:8px 0 0;font-size:24px;color:#10213a">${escapeHtml(shareLinkTitle || "OpenPay Payment")}</h3>\n      <p style="margin:8px 0 16px;color:#5c6b82;font-size:14px">Secure checkout powered by OpenPay</p>\n      <a href="${createdUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#0057d8;color:#fff;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:700">Pay now</a>\n    </div>\n  </body>\n</html>`,
    [createdUrl, shareLinkTitle],
  );

  const shareIframeCode = useMemo(
    () =>
      `<iframe src="${createdUrl}" width="100%" height="720" frameborder="0" style="border:1px solid #d9e6ff;border-radius:12px;max-width:560px;" allow="payment *"></iframe>`,
    [createdUrl],
  );

  const downloadQrCode = () => {
    const sourceCanvas = document.getElementById("payment-link-share-qr-download-source") as HTMLCanvasElement | null;
    if (!sourceCanvas) {
      toast.error("QR image not ready");
      return;
    }
    const dataUrl = sourceCanvas.toDataURL("image/png");
    const safeName = (shareLinkTitle || "openpay-payment-link")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${safeName || "openpay"}-qr.png`;
    link.click();
    toast.success("QR download started");
  };

  const createLink = async () => {
    const items = filteredProducts
      .map((p) => ({ product_id: p.id, quantity: Number(selectedQty[p.id] || 0) }))
      .filter((x) => x.quantity > 0);

    if (!secretKey.trim()) {
      toast.error("Secret key is required");
      return;
    }
    if (type === "products" && !items.length) {
      toast.error("Select at least one product");
      return;
    }
    if (type === "custom_amount" && Number(customAmount || 0) <= 0) {
      toast.error("Custom amount must be greater than 0");
      return;
    }

    setCreating(true);
    const { data, error } = await db.rpc("create_merchant_payment_link", {
      p_secret_key: secretKey.trim(),
      p_mode: mode,
      p_link_type: type,
      p_title: title,
      p_description: description,
      p_currency: currency.toUpperCase(),
      p_custom_amount: type === "custom_amount" ? Number(customAmount) : null,
      p_items: type === "products" ? items : [],
      p_collect_customer_name: collectName,
      p_collect_customer_email: collectEmail,
      p_collect_phone: collectPhone,
      p_collect_address: collectAddress,
      p_after_payment_type: afterPaymentType,
      p_confirmation_message: confirmationMessage,
      p_redirect_url: afterPaymentType === "redirect" ? redirectUrl : null,
      p_call_to_action: callToAction,
      p_expires_in_minutes: null,
    });
    setCreating(false);

    if (error) {
      toast.error(error.message || "Failed to create payment link");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const token = row?.link_token || "";
    if (!token) {
      toast.error("Payment link token missing");
      return;
    }

    const url = formatLinkUrl(token);
    setCreatedUrl(url);
    setShareLinkTitle(title || "OpenPay Payment");
    setShareTab("button");
    setButtonStyle("default");
    setButtonSize("medium");
    setShowCreateForm(false);
    setShareModalOpen(true);
    toast.success("Payment link created");
    if (merchantUserId) {
      await loadPaymentLinks(merchantUserId);
    }
  };

  const deletePaymentLink = async () => {
    if (!pendingDeleteLink) return;
    const { data, error } = await db.rpc("delete_my_merchant_payment_link", { p_link_id: pendingDeleteLink.id });
    if (error || !data) {
      toast.error(error?.message || "Failed to delete payment link");
      return;
    }
    if (merchantUserId) {
      await loadPaymentLinks(merchantUserId);
    }
    setDeleteModalOpen(false);
    setPendingDeleteLink(null);
    toast.success("Payment link deleted");
  };

  if (loading) {
    return <SplashScreen message="Loading payment links..." />;
  }

  if (showCreateForm) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-full p-2 text-foreground hover:bg-secondary"
                aria-label="Close create payment link"
              >
                <X className="h-5 w-5" />
              </button>
              <p className="text-lg font-semibold text-foreground">Create payment link</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => navigate("/merchant-pos")}>
                <Store className="mr-1 h-4 w-4" />
                POS
              </Button>
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => navigate("/openpay-api-docs")}>
                <FileText className="mr-1 h-4 w-4" />
                API docs
              </Button>
              <Button
                onClick={createLink}
                disabled={creating}
                className="h-10 rounded-full bg-paypal-blue px-5 text-white hover:bg-[#004dc5]"
              >
                {creating ? "Creating..." : "Create payment link"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[1600px] gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-r border-border">
            <div className="h-[calc(100vh-69px)] overflow-y-auto px-6 py-6">
              <div className="max-w-2xl space-y-8">
                <section>
                  <h2 className="text-2xl font-semibold text-foreground">Details</h2>
                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">Link to</p>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as LinkType)}
                        className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      >
                        <option value="products">Select product or service</option>
                        <option value="custom_amount">Custom amount</option>
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">Optional</p>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">Title</p>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-12 rounded-xl"
                        placeholder="What are you charging for?"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">Description</p>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="min-h-[180px] w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-paypal-blue"
                        placeholder="Add details or notes"
                      />
                    </div>
                  </div>
                </section>

                <section className="border-t border-border pt-7">
                  <h3 className="text-2xl font-semibold text-foreground">Payment details</h3>
                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBillingType("one_time")}
                        className={`h-20 rounded-xl border text-center ${billingType === "one_time" ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
                      >
                        <p className="text-lg font-semibold">One-time</p>
                        <p className="text-sm">Charge a one-time amount</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingType("subscription")}
                        className={`h-20 rounded-xl border text-center ${billingType === "subscription" ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
                      >
                        <p className="text-lg font-semibold">Subscription</p>
                        <p className="text-sm">Charge an ongoing amount</p>
                      </button>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">Amount</p>
                      <Input
                        value={customAmount}
                        onChange={(e) => {
                          setCustomAmount(e.target.value);
                          setType("custom_amount");
                        }}
                        className="h-12 rounded-xl"
                        placeholder="$ 0.00"
                      />
                    </div>

                    <div>
                      <p className="text-xl font-semibold text-foreground">Decide who pays the fee</p>
                      <p className="mt-1 text-sm text-muted-foreground">We updated our fee structure.</p>
                      <div className="mt-3 rounded-xl border border-border p-3">
                        <label className="flex items-start justify-between gap-3 py-2">
                          <div>
                            <p className="font-medium text-foreground">I&apos;ll cover platform fee</p>
                            <p className="text-sm text-muted-foreground">To be calculated</p>
                          </div>
                          <input type="checkbox" checked={coverPlatformFee} onChange={(e) => setCoverPlatformFee(e.target.checked)} />
                        </label>
                        <label className="flex items-start justify-between gap-3 border-t border-border py-2">
                          <div>
                            <p className="font-medium text-foreground">I&apos;ll cover processing fees</p>
                            <p className="text-sm text-muted-foreground">To be calculated</p>
                          </div>
                          <input type="checkbox" checked={coverProcessingFee} onChange={(e) => setCoverProcessingFee(e.target.checked)} />
                        </label>
                      </div>
                    </div>

                    {billingType === "subscription" && (
                      <div>
                        <p className="mb-2 text-xl font-semibold text-foreground">Repeat payment every</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)} type="number" min="1" className="h-12 rounded-xl" />
                          <select
                            value={repeatUnit}
                            onChange={(e) => setRepeatUnit(e.target.value as "day" | "week" | "month" | "year")}
                            className="h-12 rounded-xl border border-border bg-background px-3"
                          >
                            <option value="day">day</option>
                            <option value="week">week</option>
                            <option value="month">month</option>
                            <option value="year">year</option>
                          </select>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Customers will be charged {currency} {displayAmount} every {repeatUnit}, starting from the first payment.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="h-12 rounded-xl border border-border bg-background px-3">
                        <option value="sandbox">sandbox</option>
                        <option value="live">live</option>
                      </select>
                      <div className="relative">
                        {currency === "PI" && (
                          <img
                            src={PURE_PI_ICON_URL}
                            alt="Pure Pi"
                            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full object-cover"
                          />
                        )}
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                          className={`h-12 w-full rounded-xl border border-border bg-background text-sm ${currency === "PI" ? "pl-10 pr-3" : "px-3"}`}
                        >
                          {currencyChoices.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.flag} {getPiCodeLabel(item.code)} - {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="h-12 rounded-xl col-span-2" placeholder={`osk_${mode}_...`} />
                    </div>

                    {type === "products" && (
                      <div>
                        <p className="mb-2 text-sm font-semibold text-foreground">Products</p>
                        <div className="space-y-2">
                          {filteredProducts.map((p) => (
                            <div key={p.id} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_120px]">
                              <p className="text-sm text-foreground">{p.product_name} ({p.currency} {Number(p.unit_amount).toFixed(2)})</p>
                              <Input
                                value={String(selectedQty[p.id] || "")}
                                onChange={(e) => setSelectedQty((prev) => ({ ...prev, [p.id]: Number(e.target.value || 0) }))}
                                placeholder="Qty"
                                className="h-10 rounded-lg"
                              />
                            </div>
                          ))}
                          {!filteredProducts.length && <p className="text-sm text-muted-foreground">No active products for {currency}.</p>}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-semibold text-foreground">Customer fields</p>
                        <div className="grid gap-2 text-sm">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={collectName} onChange={(e) => setCollectName(e.target.checked)} /> Collect customer name</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={collectEmail} onChange={(e) => setCollectEmail(e.target.checked)} /> Collect customer email</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={collectPhone} onChange={(e) => setCollectPhone(e.target.checked)} /> Collect phone</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={collectAddress} onChange={(e) => setCollectAddress(e.target.checked)} /> Collect address</label>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-semibold text-foreground">After payment</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setAfterPaymentType("confirmation")}
                            className={`h-10 rounded-xl border text-sm ${afterPaymentType === "confirmation" ? "border-paypal-blue text-paypal-blue" : "border-border text-foreground"}`}
                          >
                            Confirmation
                          </button>
                          <button
                            onClick={() => setAfterPaymentType("redirect")}
                            className={`h-10 rounded-xl border text-sm ${afterPaymentType === "redirect" ? "border-paypal-blue text-paypal-blue" : "border-border text-foreground"}`}
                          >
                            Redirect
                          </button>
                        </div>
                        {afterPaymentType === "confirmation" ? (
                          <Input value={confirmationMessage} onChange={(e) => setConfirmationMessage(e.target.value)} className="mt-2 h-11 rounded-xl" placeholder="Thanks for your payment." />
                        ) : (
                          <Input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} className="mt-2 h-11 rounded-xl" placeholder="https://your-site.com/thank-you" />
                        )}
                      </div>
                    </div>

                    {createdUrl && (
                      <div className="rounded-xl border border-paypal-blue/30 bg-paypal-blue/5 p-3">
                        <p className="text-sm font-semibold text-foreground">Payment link ready</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{createdUrl}</p>
                        <div className="mt-2 flex gap-2">
                          <Button variant="outline" className="h-8 rounded-lg" onClick={() => handleCopy(createdUrl, "Payment link")}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </Button>
                          <Button variant="outline" className="h-8 rounded-lg" onClick={() => window.open(createdUrl, "_blank")}>
                            Open
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="bg-secondary/30">
            <div className="sticky top-[69px] h-[calc(100vh-69px)] px-6 py-6">
              <h3 className="mb-4 text-xl font-semibold text-foreground">Checkout</h3>
              <div className="h-full rounded-2xl border border-border bg-background p-4">
                <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <BrandLogo className="h-5 w-5" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenPay</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{billingType === "subscription" ? "Subscribe to" : "Pay"}</p>
                  <p className="text-xl font-semibold text-foreground">{title || "OpenPay Payment"}</p>
                  <p className="mt-2 text-4xl font-bold text-foreground">
                    ${displayAmount}
                    {billingType === "subscription" && <span className="ml-1 text-sm font-medium text-muted-foreground">per {repeatUnit}</span>}
                  </p>
                  {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
                  <div className="mt-4 rounded-xl border border-border p-3">
                    <p className="text-sm text-muted-foreground">Subtotal</p>
                    <p className="text-lg font-semibold text-foreground">${displayAmount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {coverPlatformFee || coverProcessingFee ? "You cover fees enabled." : "Customer pays standard fees."}
                    </p>
                  </div>
                  <button className="mt-4 h-10 w-full rounded-full bg-paypal-blue text-sm font-semibold text-white">
                    {callToAction || "Pay"}
                  </button>
                  <p className="mt-3 text-center text-xs text-muted-foreground">Secure payment checkout</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4">
        <div className="flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setShowMenuSelection((prev) => !prev)}
              className="paypal-surface rounded-full p-2 text-foreground"
              aria-label="Open merchant menu selection"
            >
              <Menu className="h-6 w-6" />
            </button>

            {showMenuSelection && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setShowMenuSelection(false)}
                  aria-label="Close menu selection"
                />
                <div className="absolute left-0 top-12 z-30 w-56 rounded-xl border border-border bg-card p-2 shadow-xl">
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                    onClick={() => {
                      setShowMenuSelection(false);
                      navigate("/merchant-onboarding");
                    }}
                  >
                    Merchant portal
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                    onClick={() => {
                      setShowMenuSelection(false);
                      navigate("/dashboard");
                    }}
                  >
                    Dashboard
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                    onClick={() => {
                      setShowMenuSelection(false);
                      navigate("/menu");
                    }}
                  >
                    Main menu
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                    onClick={() => {
                      setShowMenuSelection(false);
                      navigate("/merchant-pos");
                    }}
                  >
                    Merchant POS
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                    onClick={() => {
                      setShowMenuSelection(false);
                      navigate("/openpay-api-docs");
                    }}
                  >
                    API docs
                  </button>
                  <button
                    className="w-full rounded-lg bg-secondary px-3 py-2 text-left text-sm font-medium text-foreground"
                    onClick={() => setShowMenuSelection(false)}
                  >
                    Payment links
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-foreground" />
            <p className="text-4xl font-black leading-none tracking-tight text-foreground">Checkout Links</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="paypal-surface rounded-full p-2 text-foreground"
              aria-label="Open Merchant POS"
              onClick={() => navigate("/merchant-pos")}
            >
              <Store className="h-5 w-5" />
            </button>
            <button
              className="paypal-surface rounded-full p-2 text-foreground"
              aria-label="API docs"
              onClick={() => navigate("/openpay-api-docs")}
            >
              <FileText className="h-5 w-5" />
            </button>
            <button
              className="paypal-surface rounded-full p-2 text-foreground"
              aria-label="Messages"
              onClick={() => navigate("/contacts")}
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <button
              className="paypal-surface relative rounded-full p-2 text-foreground"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="h-5 w-5" />
              {unreadNotifications > 0 && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-foreground">Payment links</h1>
            <p className="mt-2 text-base text-muted-foreground">{paymentLinks.length} link{paymentLinks.length === 1 ? "" : "s"}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-paypal-blue px-5 text-lg font-semibold text-white hover:bg-[#004dc5]"
          >
            <Plus className="h-5 w-5" />
            Create
          </button>
        </div>

        <div className="paypal-surface mt-6 overflow-hidden rounded-2xl">
          {paymentLinks.length === 0 && (
            <p className="px-6 py-8 text-base text-muted-foreground">No payment links yet.</p>
          )}

          {paymentLinks.map((link) => {
            const checkoutUrl = formatLinkUrl(link.link_token);
            return (
              <div key={link.id} className="border-b border-border/70 px-6 py-5 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="rounded bg-paypal-success/15 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-paypal-success">
                      {link.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-muted-foreground">{formatCreatedDate(link.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedUrl(checkoutUrl);
                        setShareLinkTitle(link.title || "OpenPay Payment");
                        setShareTab("button");
                        setShareModalOpen(true);
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
                      aria-label="Open share tools"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(checkoutUrl, "Payment link")}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
                      aria-label="Copy payment link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(checkoutUrl, "_blank")}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
                      aria-label="Open payment link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDeleteLink(link);
                        setDeleteModalOpen(true);
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
                      aria-label="Delete payment link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-2xl font-semibold text-foreground">{link.title || "OpenPay Payment"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatLinkAmountLabel(link)} · Total sales: $0.00 · Total revenue: $0.00 · 0 purchases
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground">Created! Share payment link</h2>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                aria-label="Close share modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Share this link to collect payments with OpenPay virtual card checkout.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-secondary/30 p-1">
              {([
                ["button", "Button"],
                ["widget", "Widget"],
                ["iframe", "iFrame"],
                ["direct", "Direct link"],
                ["qr", "QR code"],
              ] as Array<[ShareTab, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShareTab(key)}
                  className={`rounded-lg px-3 py-2 text-sm ${shareTab === key ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {shareTab === "button" && (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">HTML Button Code</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paste this into your website HTML.</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{shareButtonHtmlCode}</code></pre>
                  <Button className="mt-2 h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={() => void handleCopy(shareButtonHtmlCode, "HTML button code")}>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">React Component</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{shareButtonReactCode}</code></pre>
                  <Button className="mt-2 h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={() => void handleCopy(shareButtonReactCode, "React button code")}>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">Preview</p>
                  <div className="mt-2 rounded-xl bg-secondary/30 p-6 text-center">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        background: shareButtonBg,
                        color: "#fff",
                        padding: shareButtonPadding,
                        borderRadius: "10px",
                        textDecoration: "none",
                        fontWeight: 700,
                        fontFamily: "Arial,sans-serif",
                      }}
                    >
                      <BrandLogo className="h-4 w-4" />
                      Pay with OpenPay
                    </span>
                  </div>
                </div>
              </div>
            )}

            {shareTab === "widget" && (
              <div className="mt-4 rounded-2xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Complete Widget</p>
                <p className="mt-1 text-xs text-muted-foreground">Full embeddable widget page for websites/apps.</p>
                <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{shareWidgetHtmlCode}</code></pre>
                <Button className="mt-2 h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={() => void handleCopy(shareWidgetHtmlCode, "Widget code")}>
                  <Copy className="mr-1 h-4 w-4" />
                  Copy
                </Button>
                <div className="mt-3 rounded-xl bg-secondary/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <div className="mx-auto mt-2 max-w-sm rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <BrandLogo className="h-5 w-5" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenPay</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Pay link</p>
                    <p className="text-xl font-semibold text-foreground">{shareLinkTitle || "OpenPay Payment"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Secure checkout powered by OpenPay</p>
                    <button className="mt-4 h-10 w-full rounded-full bg-paypal-blue text-sm font-semibold text-white">
                      Pay now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {shareTab === "iframe" && (
              <div className="mt-4 rounded-2xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">iFrame Embed</p>
                <p className="mt-1 text-xs text-muted-foreground">Embed OpenPay checkout directly in your site.</p>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{shareIframeCode}</code></pre>
                <Button className="mt-2 h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={() => void handleCopy(shareIframeCode, "iFrame code")}>
                  <Copy className="mr-1 h-4 w-4" />
                  Copy
                </Button>
                <div className="mt-3 rounded-xl border border-border bg-card p-2">
                  <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <iframe
                    src={createdUrl}
                    title="OpenPay iFrame preview"
                    className="h-[440px] w-full rounded-lg border border-border"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {shareTab === "direct" && (
              <div className="mt-4 rounded-2xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Direct Payment Link</p>
                <div className="mt-2 flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-2">
                  <p className="flex-1 truncate text-sm text-foreground">{createdUrl}</p>
                  <Button className="h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={() => void handleCopy(createdUrl, "Payment link")}>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy link
                  </Button>
                  <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => window.open(createdUrl, "_blank")}>
                    Open
                  </Button>
                </div>
                <div className="mt-3 rounded-xl bg-secondary/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <div className="mt-2 rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Share this direct link in chat, app, social media, or website.</p>
                    <a
                      href={createdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex rounded-full bg-paypal-blue px-4 py-2 text-sm font-semibold text-white"
                    >
                      Open payment page
                    </a>
                  </div>
                </div>
              </div>
            )}

            {shareTab === "qr" && (
              <div className="mt-4 rounded-2xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">QR Code</p>
                <p className="mt-1 text-xs text-muted-foreground">Customers can scan to pay instantly.</p>
                <div className="mt-3 flex justify-center rounded-xl bg-card p-4">
                  <QRCodeSVG value={createdUrl} size={240} includeMargin imageSettings={qrImageSettings} level="H" />
                </div>
                <div className="mt-2 hidden">
                  <QRCodeCanvas
                    id="payment-link-share-qr-download-source"
                    value={createdUrl}
                    size={720}
                    includeMargin
                    imageSettings={{
                      ...qrImageSettings,
                      width: 120,
                      height: 120,
                    }}
                    level="H"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button className="h-9 rounded-full bg-paypal-blue px-4 text-white hover:bg-[#004dc5]" onClick={downloadQrCode}>
                    Download QR
                  </Button>
                  <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => void handleCopy(createdUrl, "Payment link")}>
                    Copy link
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete `{pendingDeleteLink?.title || "OpenPay Payment"}`. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteLink(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deletePaymentLink}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PaymentLinksCreatePage;
