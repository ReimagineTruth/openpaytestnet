import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, HelpCircle, History, Printer, RotateCcw, Search, Settings, Wallet, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/BrandLogo";
import SplashScreen from "@/components/SplashScreen";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type PosView = "home" | "receive" | "history" | "refund" | "settings";
type PaymentStatus = "idle" | "waiting" | "success" | "failed";

type PosDashboard = {
  merchant_name: string;
  merchant_username: string;
  wallet_balance: number;
  today_total_received: number;
  today_transactions: number;
  refunded_transactions: number;
  key_mode: "sandbox" | "live";
};

type PosTx = {
  payment_id: string;
  payment_created_at: string;
  payment_status: string;
  amount: number;
  currency: string;
  payer_user_id: string;
  payer_name: string;
  payer_username: string | null;
  transaction_id: string;
  transaction_note: string | null;
  session_token: string;
  customer_name: string | null;
  customer_email: string | null;
};

type PosSession = {
  session_id: string;
  session_token: string;
  total_amount: number;
  currency: string;
  status: string;
  expires_at: string;
  qr_payload: string;
};

type OfflineQueuedPayment = {
  amount: number;
  currency: string;
  qrStyle: "dynamic" | "static";
  createdAt: string;
};
type PosApiKeySettings = {
  sandbox_api_key_id: string | null;
  sandbox_key_name: string | null;
  sandbox_publishable_key: string | null;
  live_api_key_id: string | null;
  live_key_name: string | null;
  live_publishable_key: string | null;
};

const OFFLINE_POS_KEY = "openpay_pos_offline_queue_v1";
const SETTINGS_KEY = "openpay_pos_settings_v1";

const MerchantPosPage = () => {
  const navigate = useNavigate();
  const { currencies, currency: activeCurrency } = useCurrency();
  const [activeView, setActiveView] = useState<PosView>("home");
  const [mode, setMode] = useState<"sandbox" | "live">("live");
  const [dashboard, setDashboard] = useState<PosDashboard | null>(null);
  const [transactions, setTransactions] = useState<PosTx[]>([]);
  const [amountInput, setAmountInput] = useState("0");
  const [currency, setCurrency] = useState(activeCurrency.code);
  const [merchantUserId, setMerchantUserId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [currentSession, setCurrentSession] = useState<PosSession | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "succeeded" | "refunded">("all");
  const [selectedTx, setSelectedTx] = useState<PosTx | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [qrStyle, setQrStyle] = useState<"dynamic" | "static">("dynamic");
  const [storeName, setStoreName] = useState("");
  const [notificationSound, setNotificationSound] = useState(true);
  const [notificationVibration, setNotificationVibration] = useState(true);
  const [inventoryLinking, setInventoryLinking] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [posApiSecretInput, setPosApiSecretInput] = useState("");
  const [savingPosApiKey, setSavingPosApiKey] = useState(false);
  const [receiptIssuedAt, setReceiptIssuedAt] = useState<string | null>(null);
  const [hasActiveApiKey, setHasActiveApiKey] = useState(true);
  const [configuredApiKeyName, setConfiguredApiKeyName] = useState("");

  const amountValue = useMemo(() => {
    const parsed = Number(amountInput || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }, [amountInput]);

  const normalizedAmount = useMemo(() => {
    return amountValue > 0 ? amountValue.toFixed(2) : "";
  }, [amountValue]);

  const getPiCodeLabel = (code: string) => (code === "PI" ? "PI" : `PI ${code}`);

  const qrDisplayValue = useMemo(() => {
    if (!merchantUserId) return "openpay-pos://waiting";
    const params = new URLSearchParams({
      uid: merchantUserId,
      name: (storeName || dashboard?.merchant_name || "OpenPay Merchant").trim(),
      username: dashboard?.merchant_username || "",
      currency,
      note: "POS payment",
    });
    if (normalizedAmount) params.set("amount", normalizedAmount);
    if (currentSession?.session_token) params.set("checkout_session", currentSession.session_token);
    return `openpay://pay?${params.toString()}`;
  }, [currency, currentSession?.session_token, dashboard?.merchant_name, dashboard?.merchant_username, merchantUserId, normalizedAmount, storeName]);
  const selectedUnitLabel = getPiCodeLabel(currency);
  const qrStoreName = (storeName || dashboard?.merchant_name || "OpenPay Merchant").trim();
  const qrMerchantUsername = (dashboard?.merchant_username || "merchant").replace(/^@+/, "");

  const pushNotification = (message: string, status: "success" | "error" = "success") => {
    if (status === "success") toast.success(message);
    else toast.error(message);

    if (notificationVibration && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(100);
    }
    if (notificationSound && typeof window !== "undefined") {
      const audio = new Audio(
        status === "success"
          ? "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YTAAAAAA"
          : "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YTAAAAAA"
      );
      void audio.play().catch(() => undefined);
    }
  };

  const loadPosApiKeySettings = async (targetMode: "sandbox" | "live" = mode) => {
    const { data, error } = await (supabase as any).rpc("get_my_pos_api_key_settings");
    if (error) throw new Error(error.message || "Failed to load POS API key settings");

    const settingsRow = (Array.isArray(data) ? data[0] : data) as PosApiKeySettings | null;
    const configuredId = targetMode === "sandbox" ? settingsRow?.sandbox_api_key_id : settingsRow?.live_api_key_id;
    const configuredName = targetMode === "sandbox" ? settingsRow?.sandbox_key_name : settingsRow?.live_key_name;
    setConfiguredApiKeyName(String(configuredName || ""));
    setHasActiveApiKey(Boolean(configuredId));
  };

  const loadData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setMerchantUserId(user.id);

    await (supabase as any).rpc("upsert_my_merchant_profile", {
      p_merchant_name: null,
      p_merchant_username: null,
      p_merchant_logo_url: null,
      p_default_currency: currency,
    });

    const [{ data: summary, error: summaryError }, { data: txRows, error: txError }] = await Promise.all([
      (supabase as any).rpc("get_my_pos_dashboard", { p_mode: mode }),
      (supabase as any).rpc("get_my_pos_transactions", {
        p_mode: mode,
        p_status: historyStatus === "all" ? null : historyStatus,
        p_search: historySearch || null,
        p_limit: 100,
        p_offset: 0,
      }),
    ]);

    if (summaryError) throw new Error(summaryError.message || "Failed to load POS dashboard");
    if (txError) throw new Error(txError.message || "Failed to load POS transactions");
    await loadPosApiKeySettings(mode);

    const summaryRow = Array.isArray(summary) ? summary[0] : summary;
    if (summaryRow) {
      setDashboard({
        merchant_name: String(summaryRow.merchant_name || "OpenPay Merchant"),
        merchant_username: String(summaryRow.merchant_username || ""),
        wallet_balance: Number(summaryRow.wallet_balance || 0),
        today_total_received: Number(summaryRow.today_total_received || 0),
        today_transactions: Number(summaryRow.today_transactions || 0),
        refunded_transactions: Number(summaryRow.refunded_transactions || 0),
        key_mode: (String(summaryRow.key_mode || mode) as "sandbox" | "live"),
      });
    }

    setTransactions(
      (Array.isArray(txRows) ? txRows : []).map((row: any) => ({
        payment_id: String(row.payment_id),
        payment_created_at: String(row.payment_created_at || ""),
        payment_status: String(row.payment_status || "succeeded"),
        amount: Number(row.amount || 0),
        currency: String(row.currency || "USD"),
        payer_user_id: String(row.payer_user_id || ""),
        payer_name: String(row.payer_name || "OpenPay Customer"),
        payer_username: row.payer_username ? String(row.payer_username) : null,
        transaction_id: String(row.transaction_id || ""),
        transaction_note: row.transaction_note ? String(row.transaction_note) : null,
        session_token: String(row.session_token || ""),
        customer_name: row.customer_name ? String(row.customer_name) : null,
        customer_email: row.customer_email ? String(row.customer_email) : null,
      }))
    );
  };

  useEffect(() => {
    const init = async () => {
      try {
        const settingsRaw = localStorage.getItem(SETTINGS_KEY);
        if (settingsRaw) {
          const parsed = JSON.parse(settingsRaw) as Record<string, unknown>;
          if (parsed.offlineMode === true || parsed.offlineMode === false) setOfflineMode(Boolean(parsed.offlineMode));
          if (parsed.qrStyle === "dynamic" || parsed.qrStyle === "static") setQrStyle(parsed.qrStyle);
          if (typeof parsed.storeName === "string") setStoreName(parsed.storeName);
          if (parsed.notificationSound === true || parsed.notificationSound === false) setNotificationSound(Boolean(parsed.notificationSound));
          if (parsed.notificationVibration === true || parsed.notificationVibration === false) setNotificationVibration(Boolean(parsed.notificationVibration));
          if (parsed.inventoryLinking === true || parsed.inventoryLinking === false) setInventoryLinking(Boolean(parsed.inventoryLinking));
        }
        const queueRaw = localStorage.getItem(OFFLINE_POS_KEY);
        if (queueRaw) {
          const parsed = JSON.parse(queueRaw);
          if (Array.isArray(parsed)) setOfflineQueue(parsed as OfflineQueuedPayment[]);
        }
        await loadData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load POS");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        offlineMode,
        qrStyle,
        storeName,
        notificationSound,
        notificationVibration,
        inventoryLinking,
      })
    );
  }, [inventoryLinking, notificationSound, notificationVibration, offlineMode, qrStyle, storeName]);

  useEffect(() => {
    localStorage.setItem(OFFLINE_POS_KEY, JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  useEffect(() => {
    if (!currentSession || paymentStatus !== "waiting") return;

    const timer = window.setInterval(async () => {
      const { data, error } = await (supabase as any)
        .from("merchant_checkout_sessions")
        .select("status, paid_at")
        .eq("id", currentSession.session_id)
        .maybeSingle();
      if (error || !data) return;

      if (data.status === "paid") {
        setPaymentStatus("success");
        pushNotification("Payment successful", "success");
        void loadData();
      } else if (data.status === "expired" || data.status === "canceled") {
        setPaymentStatus("failed");
        pushNotification("Payment failed or expired", "error");
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [currentSession, paymentStatus]);

  useEffect(() => {
    if (loading) return;
    void loadData().catch(() => undefined);
  }, [historySearch, historyStatus, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currencies.find((c) => c.code === currency)) {
      setCurrency(activeCurrency.code);
    }
  }, [activeCurrency.code, currencies, currency]);

  const pressKey = (key: string) => {
    setAmountInput((prev) => {
      if (key === "C") return "0";
      if (key === "DEL") return prev.length <= 1 ? "0" : prev.slice(0, -1);
      if (key === ".") return prev.includes(".") ? prev : `${prev}.`;
      if (prev === "0") return key;
      return `${prev}${key}`;
    });
  };

  const createPaymentSession = async () => {
    if (amountValue <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (currency === "PI") {
      setCurrentSession(null);
      setPaymentStatus("idle");
      setActiveView("receive");
      setReceiptIssuedAt(new Date().toISOString());
      toast.success("PI QR code generated");
      return;
    }

    if (offlineMode && typeof navigator !== "undefined" && !navigator.onLine) {
      setOfflineQueue((prev) => [
        ...prev,
        { amount: amountValue, currency, qrStyle, createdAt: new Date().toISOString() },
      ]);
      setPaymentStatus("waiting");
      toast.message("Offline mode enabled. Payment request queued for sync.");
      return;
    }

    setCreatingPayment(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_my_pos_checkout_session", {
        p_amount: amountValue,
        p_currency: currency,
        p_mode: mode,
        p_customer_name: null,
        p_customer_email: null,
        p_reference: null,
        p_qr_style: qrStyle,
        p_expires_in_minutes: qrStyle === "static" ? 1440 : 30,
      });
      if (error) throw new Error(error.message || "Failed to create POS payment");

      const row = Array.isArray(data) ? (data[0] as PosSession | undefined) : (data as PosSession | null);
      if (!row?.session_token) throw new Error("Missing POS session token");
      setCurrentSession(row);
      setPaymentStatus("waiting");
      setActiveView("receive");
      setReceiptIssuedAt(new Date().toISOString());
      toast.success("QR code generated");
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "Failed to create payment", "error");
    } finally {
      setCreatingPayment(false);
    }
  };

  const savePosApiKey = async () => {
    const secret = posApiSecretInput.trim();
    if (!secret) {
      toast.error("Paste your secret API key first");
      return;
    }

    setSavingPosApiKey(true);
    try {
      const { error } = await (supabase as any).rpc("upsert_my_pos_api_key", {
        p_mode: mode,
        p_secret_key: secret,
      });
      if (error) throw new Error(error.message || "Failed to save POS API key");
      setPosApiSecretInput("");
      setShowApiKeyModal(false);
      await loadPosApiKeySettings(mode);
      toast.success(`${mode} POS API key saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save POS API key");
    } finally {
      setSavingPosApiKey(false);
    }
  };

  const syncOfflineQueue = async () => {
    if (!offlineQueue.length) {
      toast.message("No offline transactions to sync");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You are still offline");
      return;
    }

    setSyncingQueue(true);
    let synced = 0;
    try {
      for (const row of offlineQueue) {
        const { error } = await (supabase as any).rpc("create_my_pos_checkout_session", {
          p_amount: row.amount,
          p_currency: row.currency,
          p_mode: mode,
          p_customer_name: null,
          p_customer_email: null,
          p_reference: "offline_sync",
          p_qr_style: row.qrStyle,
          p_expires_in_minutes: row.qrStyle === "static" ? 1440 : 30,
        });
        if (!error) synced += 1;
      }
      setOfflineQueue([]);
      await loadData();
      toast.success(`Synced ${synced} queued payment requests`);
    } finally {
      setSyncingQueue(false);
    }
  };

  const refundTransaction = async (tx: PosTx) => {
    setRefunding(true);
    try {
      const { data, error } = await (supabase as any).rpc("refund_my_pos_transaction", {
        p_payment_id: tx.payment_id,
        p_reason: "POS refund",
      });
      if (error) throw new Error(error.message || "Refund failed");
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`Refunded successfully (${row?.refund_transaction_id || "done"})`);
      setSelectedTx(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  };

  const copyQrValue = async () => {
    try {
      await navigator.clipboard.writeText(qrDisplayValue);
      toast.success("QR payment link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const printPosReceipt = () => {
    if (!normalizedAmount) {
      toast.error("Enter an amount first");
      return;
    }
    window.print();
  };

  if (loading) {
    return <SplashScreen message="Loading OpenPay POS..." />;
  }

  const renderStatus = () => {
    if (paymentStatus === "success") {
      return <p className="mt-3 flex items-center justify-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Payment Successful</p>;
    }
    if (paymentStatus === "failed") {
      return <p className="mt-3 flex items-center justify-center gap-2 text-rose-600"><XCircle className="h-4 w-4" /> Payment Failed</p>;
    }
    if (paymentStatus === "waiting") {
      return <p className="mt-3 text-center text-sm text-muted-foreground">Waiting for payment...</p>;
    }
    return null;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-8">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pos-print-receipt,
          #pos-print-receipt * {
            visibility: visible !important;
          }
          #pos-print-receipt {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: center !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 9999 !important;
          }
        }
      `}</style>
      <header className="bg-gradient-to-r from-[#0a3b90] to-[#1d63d8] px-4 py-3 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/menu")} className="rounded-lg border border-white/20 p-2">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <BrandLogo className="h-7 w-7" />
              <div>
                <p className="text-sm font-semibold">OpenPay Merchant POS</p>
                <p className="text-xs text-white/80">@{dashboard?.merchant_username || "merchant"}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/80">Balance</p>
            <p className="text-sm font-semibold">{Number(dashboard?.wallet_balance || 0).toFixed(2)} {selectedUnitLabel}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-4 grid w-full max-w-6xl gap-4 px-4 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3">
          <h2 className="mb-3 text-lg font-bold text-foreground">Dashboard</h2>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border p-2">
              <p className="text-xs text-muted-foreground">Today total</p>
              <p className="text-lg font-bold text-foreground">{Number(dashboard?.today_total_received || 0).toFixed(2)} {selectedUnitLabel}</p>
            </div>
            <div className="rounded-xl border border-border p-2">
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-lg font-bold text-foreground">{dashboard?.today_transactions || 0}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={() => setActiveView("receive")} className="flex w-full items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-left text-sm font-semibold text-white">
              <Wallet className="h-4 w-4" /> Receive Payment
            </button>
            <button onClick={() => setActiveView("history")} className="flex w-full items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-left text-sm font-semibold text-white">
              <History className="h-4 w-4" /> Transaction History
            </button>
            <button onClick={() => setActiveView("refund")} className="flex w-full items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-left text-sm font-semibold text-white">
              <RotateCcw className="h-4 w-4" /> Refund / Cancel
            </button>
            <button onClick={() => setActiveView("settings")} className="flex w-full items-center gap-2 rounded-xl bg-muted px-3 py-2 text-left text-sm font-semibold text-foreground">
              <Settings className="h-4 w-4" /> Settings
            </button>
          </div>
        </aside>

        <section className="rounded-2xl border border-border bg-card p-4">
          {(activeView === "home" || activeView === "receive") && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-foreground">Receive Payment</h3>
                <Button
                  variant="outline"
                  className="h-9 rounded-lg border-border bg-card text-foreground hover:bg-muted"
                  onClick={() => setShowInstructions(true)}
                >
                  <HelpCircle className="mr-2 h-4 w-4" /> POS Instructions
                </Button>
                <Button
                  variant="outline"
                  className="h-9 rounded-lg border-border bg-card text-foreground hover:bg-muted"
                  onClick={() => setShowApiKeyModal(true)}
                >
                  Setup API Key
                </Button>
                <select value={mode} onChange={(e) => setMode(e.target.value as "sandbox" | "live")} className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm">
                  <option value="live">Live</option>
                  <option value="sandbox">Sandbox</option>
                </select>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {getPiCodeLabel(c.code)} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Enter amount</p>
                  <div className="mt-1 rounded-xl border border-border px-3 py-2 text-3xl font-bold text-foreground">{amountValue.toFixed(2)}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "DEL"].map((key) => (
                      <button
                        key={key}
                        onClick={() => pressKey(key)}
                        className="rounded-lg border border-border py-2 text-lg font-semibold text-foreground hover:bg-muted"
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button onClick={() => pressKey("C")} variant="outline" className="h-11 rounded-lg">Clear</Button>
                    <Button
                      onClick={createPaymentSession}
                      disabled={creatingPayment || !hasActiveApiKey}
                      className="h-11 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {creatingPayment ? "Creating..." : "Generate QR Code"}
                    </Button>
                  </div>
                  {!hasActiveApiKey && (
                    <p className="mt-2 text-xs text-rose-600">
                      Setup your {mode} POS API key first in{" "}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => setShowApiKeyModal(true)}
                      >
                        POS Settings
                      </button>
                      {" "}or create one in Merchant Portal.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-border p-3 text-center">
                  <p className="text-sm font-semibold text-foreground">Scan QR Code to Pay</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{qrStoreName}</p>
                  <div className="mt-3 flex justify-center">
                    <QRCodeSVG
                      value={qrDisplayValue}
                      size={220}
                      level="H"
                      includeMargin
                      imageSettings={{
                        src: "/openpay-o.svg",
                        height: 34,
                        width: 34,
                        excavate: true,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {normalizedAmount ? `${normalizedAmount} ${getPiCodeLabel(currency)}` : `Select amount and ${getPiCodeLabel(currency)}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">@{qrMerchantUsername}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="outline" className="h-9 rounded-lg" onClick={copyQrValue}>
                      <Copy className="mr-2 h-4 w-4" /> Copy QR link
                    </Button>
                    <Button variant="outline" className="h-9 rounded-lg" onClick={printPosReceipt}>
                      <Printer className="mr-2 h-4 w-4" /> Print Receipt
                    </Button>
                  </div>
                  {renderStatus()}
                </div>
              </div>
            </div>
          )}

          {activeView === "history" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-foreground">Transaction History</h3>
                <div className="ml-auto flex gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="h-9 pl-8" placeholder="Search..." />
                  </div>
                  <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as any)} className="h-9 rounded-lg border border-border px-3 text-sm">
                    <option value="all">All</option>
                    <option value="succeeded">Completed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {transactions.map((tx) => (
                  <button
                    key={tx.payment_id}
                    onClick={() => setSelectedTx(tx)}
                    className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left hover:bg-muted"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{tx.payer_name}</p>
                      {!!tx.customer_email && <p className="text-xs text-muted-foreground">{tx.customer_email}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(tx.payment_created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{tx.amount.toFixed(2)} {tx.currency}</p>
                      <p className={`text-xs ${tx.payment_status === "refunded" ? "text-orange-600" : "text-emerald-600"}`}>{tx.payment_status}</p>
                    </div>
                  </button>
                ))}
                {!transactions.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions found.</p>}
              </div>
            </div>
          )}

          {activeView === "refund" && (
            <div>
              <h3 className="mb-3 text-2xl font-bold text-foreground">Refund / Cancel</h3>
              <div className="space-y-2">
                {transactions
                  .filter((tx) => tx.payment_status === "succeeded")
                  .map((tx) => (
                    <div key={tx.payment_id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                      <div>
                        <p className="font-semibold text-foreground">{tx.payer_name}</p>
                        {!!tx.customer_email && <p className="text-xs text-muted-foreground">{tx.customer_email}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(tx.payment_created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{tx.amount.toFixed(2)} {tx.currency}</p>
                        <Button
                          onClick={() => refundTransaction(tx)}
                          disabled={refunding}
                          className="h-9 rounded-lg bg-orange-500 text-white hover:bg-orange-600"
                        >
                          Refund
                        </Button>
                      </div>
                    </div>
                  ))}
                {!transactions.some((tx) => tx.payment_status === "succeeded") && (
                  <p className="py-10 text-center text-sm text-muted-foreground">No completed payments available for refund.</p>
                )}
              </div>
            </div>
          )}

          {activeView === "settings" && (
            <div>
              <h3 className="mb-3 text-2xl font-bold text-foreground">Settings / Offline Mode</h3>
              <div className="space-y-3">
                <div className={`rounded-xl border px-3 py-2 ${hasActiveApiKey ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <p className="text-sm font-medium text-foreground">API key requirement ({mode})</p>
                  <p className={`mt-1 text-xs ${hasActiveApiKey ? "text-emerald-700" : "text-rose-700"}`}>
                    {hasActiveApiKey
                      ? `Configured key: ${configuredApiKeyName || "Active key"}. POS transactions are linked to Merchant Portal.`
                      : `No configured ${mode} POS API key. Paste your secret key below to enable POS recording.`}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 h-8 rounded-lg"
                    onClick={() => setShowApiKeyModal(true)}
                  >
                    Paste API Key
                  </Button>
                  <Button
                    variant="outline"
                    className="mt-2 h-8 rounded-lg"
                    onClick={() => navigate("/merchant-onboarding")}
                  >
                    Open Merchant Portal
                  </Button>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Enable offline mode</span>
                  <input type="checkbox" checked={offlineMode} onChange={(e) => setOfflineMode(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">QR code style</span>
                  <select value={qrStyle} onChange={(e) => setQrStyle(e.target.value as "dynamic" | "static")} className="rounded-lg border border-border px-2 py-1 text-sm">
                    <option value="dynamic">Dynamic</option>
                    <option value="static">Static</option>
                  </select>
                </label>
                <div className="rounded-xl border border-border px-3 py-2">
                  <p className="mb-1 text-sm font-medium text-foreground">Store name (shown above QR)</p>
                  <Input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={dashboard?.merchant_name || "OpenPay Merchant"}
                    className="h-9"
                  />
                </div>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Notification sound</span>
                  <input type="checkbox" checked={notificationSound} onChange={(e) => setNotificationSound(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Notification vibration</span>
                  <input type="checkbox" checked={notificationVibration} onChange={(e) => setNotificationVibration(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Inventory linking</span>
                  <input type="checkbox" checked={inventoryLinking} onChange={(e) => setInventoryLinking(e.target.checked)} />
                </label>
                <div className="rounded-xl border border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">Offline queue</p>
                  <p className="mt-1 text-xs text-muted-foreground">{offlineQueue.length} pending payment request(s)</p>
                  <Button
                    variant="outline"
                    className="mt-2 h-9 rounded-lg"
                    disabled={syncingQueue || !offlineQueue.length}
                    onClick={syncOfflineQueue}
                  >
                    {syncingQueue ? "Syncing..." : "Sync now"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <div id="pos-print-receipt" className="hidden print:flex">
        <div className="w-[302px] bg-card px-4 py-3 font-mono text-[11px] leading-4 text-black">
          <p className="text-center text-[15px] font-bold">OpenPay Merchant POS</p>
          <p className="text-center">{qrStoreName}</p>
          <p className="text-center">@{dashboard?.merchant_username || "merchant"}</p>
          <p className="mt-1 text-center">{new Date(receiptIssuedAt || Date.now()).toLocaleString()}</p>
          <p className="mt-2 border-t border-dashed border-black pt-2 text-center font-bold">ACKNOWLEDGEMENT RECEIPT</p>
          <p className="mt-2">Type: POS RECEIVE</p>
          <p>Mode: {mode.toUpperCase()}</p>
          <p>Currency: {getPiCodeLabel(currency)}</p>
          <p>Amount: {normalizedAmount || "0.00"}</p>
          <p>Status: {paymentStatus.toUpperCase()}</p>
          <p className="break-all">Session: {currentSession?.session_token || "N/A"}</p>
          <p className="mt-2 border-t border-dashed border-black pt-2 text-center">SCAN QR CODE TO PAY</p>
          <div className="mt-2 flex justify-center">
            <QRCodeSVG
              value={qrDisplayValue}
              size={170}
              level="H"
              includeMargin
              imageSettings={{
                src: "/openpay-o.svg",
                height: 28,
                width: 28,
                excavate: true,
              }}
            />
          </div>
          <p className="mt-1 text-center text-[10px]">@{qrMerchantUsername}</p>
          <p className="mt-1 text-center text-[10px]">Merchant and amount are pre-filled after scan.</p>
          <p className="mt-2 border-t border-dashed border-black pt-2 text-center">Thank you for using OpenPay</p>
        </div>
      </div>

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 md:items-center md:justify-center">
          <div className="w-full max-w-md rounded-2xl bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-lg font-bold text-foreground">Transaction Details</h4>
              <button onClick={() => setSelectedTx(null)} className="rounded-md border border-border px-2 py-1 text-xs">Close</button>
            </div>
            <p className="text-sm text-foreground">Payer: {selectedTx.payer_name}</p>
            {!!selectedTx.customer_email && <p className="text-sm text-foreground">Email: {selectedTx.customer_email}</p>}
            <p className="text-sm text-foreground">Amount: {selectedTx.amount.toFixed(2)} {selectedTx.currency}</p>
            <p className="text-sm text-foreground">Status: {selectedTx.payment_status}</p>
            <p className="text-sm text-foreground">Session: {selectedTx.session_token}</p>
            <p className="text-xs text-muted-foreground">{new Date(selectedTx.payment_created_at).toLocaleString()}</p>
            {selectedTx.payment_status === "succeeded" && (
              <Button
                onClick={() => refundTransaction(selectedTx)}
                disabled={refunding}
                className="mt-3 h-10 w-full rounded-lg bg-orange-500 text-white hover:bg-orange-600"
              >
                Refund this transaction
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogTitle className="text-lg font-bold text-foreground">POS Instructions</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            How to generate and print a POS payment receipt with QR.
          </DialogDescription>
          <div className="space-y-2 text-sm text-foreground">
            <p>1. Enter amount using keypad and select currency.</p>
            <p>2. Click Generate QR Code to prepare payment details.</p>
            <p>3. Click Print Receipt to print supermarket-style ticket.</p>
            <p>4. Let customer scan the QR on the printed receipt.</p>
            <p>5. Use Transaction History and Refund for post-payment actions.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogTitle className="text-lg font-bold text-foreground">Paste your POS API key</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Enter your {mode} secret key from Merchant Portal to enable POS recording.
          </DialogDescription>
          <div className="space-y-3">
            <Input
              type="password"
              value={posApiSecretInput}
              onChange={(e) => setPosApiSecretInput(e.target.value)}
              placeholder={`osk_${mode}_...`}
              className="h-11"
            />
            <Button
              className="h-10 w-full rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={savePosApiKey}
              disabled={savingPosApiKey}
            >
              {savingPosApiKey ? "Saving..." : "Enter API Key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MerchantPosPage;
