import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, ImagePlus, Printer, Store, Wallet } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadUserPreferences, upsertUserPreferences } from "@/lib/userPreferences";
import BrandLogo from "@/components/BrandLogo";
import SplashScreen from "@/components/SplashScreen";

interface SelfProfile {
  id: string;
  full_name: string;
  username: string | null;
}

interface RemittanceFeeLog {
  id: string;
  type: "deposit" | "payout";
  feeAmount: number;
  note: string;
  createdAt: string;
}

const MIN_OPERATING_BALANCE = 25;

const RemittanceMerchantPage = () => {
  const navigate = useNavigate();
  const [bootLoading, setBootLoading] = useState(true);
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [merchantName, setMerchantName] = useState("OpenPay Remittance Center");
  const [merchantUsername, setMerchantUsername] = useState("");
  const [merchantCity, setMerchantCity] = useState("");
  const [merchantCountry, setMerchantCountry] = useState("United States");
  const [businessNote, setBusinessNote] = useState("Cash deposit and payout available.");

  const [feeTitle, setFeeTitle] = useState("Remittance Fee Card");
  const [depositFeePercent, setDepositFeePercent] = useState("1.50");
  const [payoutFeePercent, setPayoutFeePercent] = useState("1.50");
  const [flatServiceFee, setFlatServiceFee] = useState("0.00");
  const [feeNotes, setFeeNotes] = useState("Rates are set by merchant and may vary by amount/currency.");

  const [qrTagline, setQrTagline] = useState("SCAN TO DEPOSIT / PAYOUT");
  const [qrAccent, setQrAccent] = useState("#2148ff");
  const [qrBackground, setQrBackground] = useState("#ffffff");
  const [bannerTitle, setBannerTitle] = useState("OpenPay Remittance Center");
  const [bannerSubtitle, setBannerSubtitle] = useState("Powered by Pi Network");
  const [merchantLogoUrl, setMerchantLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [downloadLink, setDownloadLink] = useState("");
  const [totalFeeIncome, setTotalFeeIncome] = useState(0);
  const [thisMonthFeeIncome, setThisMonthFeeIncome] = useState(0);
  const [totalRemittanceTxCount, setTotalRemittanceTxCount] = useState(0);
  const [feeLogType, setFeeLogType] = useState<"deposit" | "payout">("deposit");
  const [feeLogAmount, setFeeLogAmount] = useState("");
  const [feeLogNote, setFeeLogNote] = useState("");
  const [recentFeeLogs, setRecentFeeLogs] = useState<RemittanceFeeLog[]>([]);
  const merchantLogoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/signin");
        return;
      }

      setUserId(user.id);

      const [{ data: profileRow }, { data: walletRow }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username").eq("id", user.id).single(),
        supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
      ]);

      setProfile(profileRow || null);
      setWalletBalance(Number(walletRow?.balance || 0));

      try {
        const prefs = await loadUserPreferences(user.id);
        const merchantData = prefs.merchant_onboarding_data;
        const remittance = (
          merchantData.remittance_center &&
          typeof merchantData.remittance_center === "object" &&
          !Array.isArray(merchantData.remittance_center)
        )
          ? (merchantData.remittance_center as Record<string, unknown>)
          : {};

        if (typeof remittance.merchantName === "string" && remittance.merchantName.trim()) setMerchantName(remittance.merchantName);
        if (typeof remittance.merchantUsername === "string") setMerchantUsername(remittance.merchantUsername);
        if (typeof remittance.merchantCity === "string") setMerchantCity(remittance.merchantCity);
        if (typeof remittance.merchantCountry === "string") setMerchantCountry(remittance.merchantCountry);
        if (typeof remittance.businessNote === "string") setBusinessNote(remittance.businessNote);
        if (typeof remittance.feeTitle === "string") setFeeTitle(remittance.feeTitle);
        if (typeof remittance.depositFeePercent === "string") setDepositFeePercent(remittance.depositFeePercent);
        if (typeof remittance.payoutFeePercent === "string") setPayoutFeePercent(remittance.payoutFeePercent);
        if (typeof remittance.flatServiceFee === "string") setFlatServiceFee(remittance.flatServiceFee);
        if (typeof remittance.feeNotes === "string") setFeeNotes(remittance.feeNotes);
        if (typeof remittance.qrTagline === "string") setQrTagline(remittance.qrTagline);
        if (typeof remittance.qrAccent === "string") setQrAccent(remittance.qrAccent);
        if (typeof remittance.qrBackground === "string") setQrBackground(remittance.qrBackground);
        if (typeof remittance.bannerTitle === "string") setBannerTitle(remittance.bannerTitle);
        if (typeof remittance.bannerSubtitle === "string") setBannerSubtitle(remittance.bannerSubtitle);
        if (typeof remittance.merchantLogoUrl === "string") setMerchantLogoUrl(remittance.merchantLogoUrl);
        if (typeof remittance.totalFeeIncome === "number") setTotalFeeIncome(remittance.totalFeeIncome);
        if (typeof remittance.thisMonthFeeIncome === "number") setThisMonthFeeIncome(remittance.thisMonthFeeIncome);
        if (typeof remittance.totalRemittanceTxCount === "number") setTotalRemittanceTxCount(remittance.totalRemittanceTxCount);
        if (Array.isArray(remittance.recentFeeLogs)) {
          const safeLogs = remittance.recentFeeLogs
            .filter((item) => item && typeof item === "object")
            .map((item) => {
              const row = item as Record<string, unknown>;
              return {
                id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
                type: row.type === "payout" ? "payout" : "deposit",
                feeAmount: Number(row.feeAmount || 0),
                note: typeof row.note === "string" ? row.note : "",
                createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
              } as RemittanceFeeLog;
            })
            .filter((item) => Number.isFinite(item.feeAmount) && item.feeAmount >= 0)
            .slice(0, 20);
          setRecentFeeLogs(safeLogs);
        }
      } catch {
        // Keep defaults if preferences are unavailable.
      } finally {
        setPrefsLoaded(true);
        setBootLoading(false);
      }
    };

    load();
  }, [navigate]);

  useEffect(() => {
    if (!profile?.username && profile?.full_name && !merchantUsername.trim()) {
      setMerchantUsername(profile.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20));
    }
    if (profile?.username && !merchantUsername.trim()) {
      setMerchantUsername(profile.username);
    }
  }, [profile?.full_name, profile?.username, merchantUsername]);

  const sanitizedUsername = useMemo(
    () => merchantUsername.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, ""),
    [merchantUsername],
  );

  const downloadSafeLogoSrc = useMemo(() => {
    if (!merchantLogoUrl) return "/openpay-o.svg";
    if (merchantLogoUrl.startsWith("data:")) return merchantLogoUrl;
    if (typeof window === "undefined") return "/openpay-o.svg";
    try {
      const parsed = new URL(merchantLogoUrl, window.location.origin);
      return parsed.origin === window.location.origin ? parsed.toString() : "/openpay-o.svg";
    } catch {
      return "/openpay-o.svg";
    }
  }, [merchantLogoUrl]);

  const qrValue = useMemo(() => {
    if (!profile?.id) return "";
    const params = new URLSearchParams({
      uid: profile.id,
      username: sanitizedUsername,
      merchant: "remittance",
      city: merchantCity,
      country: merchantCountry,
    });
    return `openpay://pay?${params.toString()}`;
  }, [merchantCity, merchantCountry, profile?.id, sanitizedUsername]);

  const webPayLink = useMemo(() => {
    if (!profile?.id || typeof window === "undefined") return "";
    return `${window.location.origin}/send?to=${profile.id}`;
  }, [profile?.id]);

  const meetsMinimum = walletBalance >= MIN_OPERATING_BALANCE;

  useEffect(() => {
    if (!userId || !prefsLoaded) return;
    const timer = window.setTimeout(() => {
      upsertUserPreferences(userId, {
        merchant_onboarding_data: {
          remittance_center: {
            merchantName,
            merchantUsername: sanitizedUsername,
            merchantCity,
            merchantCountry,
            businessNote,
            feeTitle,
            depositFeePercent,
            payoutFeePercent,
            flatServiceFee,
            feeNotes,
            qrTagline,
            qrAccent,
            qrBackground,
            bannerTitle,
            bannerSubtitle,
            merchantLogoUrl,
            totalFeeIncome,
            thisMonthFeeIncome,
            totalRemittanceTxCount,
            recentFeeLogs,
            updatedAt: new Date().toISOString(),
          },
        },
      }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    businessNote,
    depositFeePercent,
    feeNotes,
    feeTitle,
    flatServiceFee,
    merchantCity,
    merchantCountry,
    merchantName,
    payoutFeePercent,
    prefsLoaded,
    qrAccent,
    qrBackground,
    qrTagline,
    bannerSubtitle,
    bannerTitle,
    merchantLogoUrl,
    recentFeeLogs,
    sanitizedUsername,
    thisMonthFeeIncome,
    totalFeeIncome,
    totalRemittanceTxCount,
    userId,
  ]);

  const handleMerchantLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/${Date.now()}.${ext}`;
    setUploadingLogo(true);

    const { error: uploadError } = await supabase.storage.from("remittance-logos").upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingLogo(false);
      toast.error(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("remittance-logos").getPublicUrl(path);

    setMerchantLogoUrl(publicUrl);
    setUploadingLogo(false);
    event.currentTarget.value = "";
    toast.success("Merchant logo uploaded");
  };

  const handleCopyLink = async () => {
    if (!webPayLink) return;
    try {
      await navigator.clipboard.writeText(webPayLink);
      toast.success("Merchant pay link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const buildPrintableQrPng = () => {
    const sourceCanvas = document.getElementById("remittance-qr-download-source") as HTMLCanvasElement | null;
    if (!sourceCanvas) throw new Error("QR image not ready");
    const dataUrl = sourceCanvas.toDataURL("image/png");
    const safeName = (merchantName || "openpay-remittance-center")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return { dataUrl, fileName: `${safeName || "openpay-remittance"}-qr.png` };
  };

  const handleDownloadPrintableQr = () => {
    try {
      const { dataUrl, fileName } = buildPrintableQrPng();
      setDownloadLink(dataUrl);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      toast.success("QR download started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    }
  };

  const handleGenerateDownloadLink = () => {
    try {
      const { dataUrl } = buildPrintableQrPng();
      setDownloadLink(dataUrl);
      toast.success("Download link generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate link");
    }
  };

  const handleOpenDownloadLink = () => {
    if (!downloadLink) return;
    window.open(downloadLink, "_blank", "noopener,noreferrer");
  };

  const handleCopyDownloadLink = async () => {
    if (!downloadLink) return;
    try {
      await navigator.clipboard.writeText(downloadLink);
      toast.success("Download link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleRecordFeeIncome = () => {
    const parsedFee = Number(feeLogAmount);
    if (!Number.isFinite(parsedFee) || parsedFee <= 0) {
      toast.error("Enter a valid fee amount");
      return;
    }

    const now = new Date();
    const nextLog: RemittanceFeeLog = {
      id: crypto.randomUUID(),
      type: feeLogType,
      feeAmount: parsedFee,
      note: feeLogNote.trim(),
      createdAt: now.toISOString(),
    };

    setRecentFeeLogs((prev) => [nextLog, ...prev].slice(0, 20));
    setTotalFeeIncome((prev) => Number((prev + parsedFee).toFixed(2)));
    setThisMonthFeeIncome((prev) => Number((prev + parsedFee).toFixed(2)));
    setTotalRemittanceTxCount((prev) => prev + 1);
    setFeeLogAmount("");
    setFeeLogNote("");
    toast.success("Fee income recorded");
  };

  if (bootLoading) {
    return <SplashScreen message="Loading remittance merchant..." />;
  }

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-24">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #remittance-print-zone, #remittance-print-zone * { visibility: visible !important; }
          #remittance-print-zone { position: absolute; inset: 0; width: 100%; padding: 24px; background: white; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="print-hide flex items-center gap-3">
        <button onClick={() => navigate("/menu")}><ArrowLeft className="h-6 w-6 text-foreground" /></button>
        <h1 className="text-lg font-semibold text-paypal-dark">Remittance Center</h1>
      </div>

      <div className="print-hide mt-4 space-y-4">
        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Remittance performance</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-white p-3">
              <p className="text-xs text-muted-foreground">Total fee income</p>
              <p className="mt-1 text-xl font-bold text-foreground">${totalFeeIncome.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-3">
              <p className="text-xs text-muted-foreground">This month fee</p>
              <p className="mt-1 text-xl font-bold text-foreground">${thisMonthFeeIncome.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-3">
              <p className="text-xs text-muted-foreground">Processed requests</p>
              <p className="mt-1 text-xl font-bold text-foreground">{totalRemittanceTxCount}</p>
            </div>
          </div>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Record remittance fee income</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={feeLogType}
              onChange={(e) => setFeeLogType((e.target.value as "deposit" | "payout") || "deposit")}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="deposit">Deposit</option>
              <option value="payout">Payout</option>
            </select>
            <Input
              value={feeLogAmount}
              onChange={(e) => setFeeLogAmount(e.target.value)}
              placeholder="Fee amount (USD)"
              type="number"
              min="0.01"
              step="0.01"
            />
            <Button type="button" className="h-11 rounded-xl" onClick={handleRecordFeeIncome}>
              Record Fee
            </Button>
          </div>
          <Input
            className="mt-3"
            value={feeLogNote}
            onChange={(e) => setFeeLogNote(e.target.value)}
            placeholder="Optional note or reference"
          />
          {recentFeeLogs.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border bg-secondary/20 p-2">
              {recentFeeLogs.slice(0, 4).map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b border-border/60 px-2 py-2 text-xs last:border-b-0">
                  <span className="font-medium text-foreground">{log.type === "deposit" ? "Deposit fee" : "Payout fee"}</span>
                  <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</span>
                  <span className="font-semibold text-foreground">${log.feeAmount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <div className="flex items-start gap-3">
            <Store className="mt-0.5 h-5 w-5 text-paypal-blue" />
            <div>
              <p className="text-sm font-semibold text-foreground">Become a remittance merchant in your location</p>
              <p className="text-xs text-muted-foreground">
                Anyone can create a local remittance center profile and serve nearby customers.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-3 text-xs text-foreground">
            <p>OpenPay has no platform fee for top up/deposit/payout.</p>
            <p>Merchants can earn by adding their own exchange fee for deposit and payout services.</p>
            <p>Real currency exchange is handled between merchant and customer, similar to standard remittance centers.</p>
          </div>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="text-sm font-semibold text-foreground">How to use remittance deposit and payout</p>
          <div className="mt-3 rounded-2xl border border-border bg-secondary/30 p-3 text-xs text-foreground">
            <p className="font-semibold">Deposit flow (cash to OpenPay balance)</p>
            <p>1. Customer provides OpenPay username, amount, and currency.</p>
            <p>2. Merchant fills the deposit form and confirms details with customer.</p>
            <p>3. Merchant sends OpenPay balance to customer OpenPay wallet.</p>
            <p>4. After customer receives balance, customer pays cash amount plus merchant fee.</p>
          </div>
          <div className="mt-3 rounded-2xl border border-border bg-secondary/30 p-3 text-xs text-foreground">
            <p className="font-semibold">Payout flow (OpenPay balance to cash)</p>
            <p>1. Customer sends OpenPay balance to merchant OpenPay wallet.</p>
            <p>2. Merchant verifies incoming transfer and payout form details.</p>
            <p>3. Merchant gives cash to customer and deducts the merchant payout fee.</p>
          </div>
          <p className="mt-3 text-xs font-semibold text-foreground">
            Only OpenPay wallet transfers are allowed for both deposit and payout processing.
          </p>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-paypal-blue" />
            <p className="text-sm font-semibold text-foreground">Operating balance requirement</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum wallet balance to run send/receive operations: ${MIN_OPERATING_BALANCE.toFixed(2)}
          </p>
          <p className={`mt-2 text-sm font-semibold ${meetsMinimum ? "text-green-600" : "text-amber-600"}`}>
            Current balance: ${walletBalance.toFixed(2)} {meetsMinimum ? "(Eligible)" : "(Add balance to activate)"}
          </p>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Merchant profile</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Store name" />
            <Input value={merchantUsername} onChange={(e) => setMerchantUsername(e.target.value)} placeholder="Merchant username" />
            <Input value={merchantCity} onChange={(e) => setMerchantCity(e.target.value)} placeholder="City / Area" />
            <Input value={merchantCountry} onChange={(e) => setMerchantCountry(e.target.value)} placeholder="Country" />
          </div>
          <Input className="mt-3" value={businessNote} onChange={(e) => setBusinessNote(e.target.value)} placeholder="Service note for customers" />
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Editable remittance fee card</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={feeTitle} onChange={(e) => setFeeTitle(e.target.value)} placeholder="Card title" />
            <Input value={flatServiceFee} onChange={(e) => setFlatServiceFee(e.target.value)} placeholder="Flat service fee (USD)" />
            <Input value={depositFeePercent} onChange={(e) => setDepositFeePercent(e.target.value)} placeholder="Deposit fee (%)" />
            <Input value={payoutFeePercent} onChange={(e) => setPayoutFeePercent(e.target.value)} placeholder="Payout fee (%)" />
          </div>
          <Input className="mt-3" value={feeNotes} onChange={(e) => setFeeNotes(e.target.value)} placeholder="Fee notes" />
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">QR and banner customization</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={qrTagline} onChange={(e) => setQrTagline(e.target.value)} placeholder="QR tagline" />
            <div className="flex items-center gap-2 rounded-xl border border-border px-3">
              <label className="text-xs text-muted-foreground">Accent</label>
              <Input type="color" value={qrAccent} onChange={(e) => setQrAccent(e.target.value)} className="h-8 border-0 p-0" />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border px-3">
              <label className="text-xs text-muted-foreground">Background</label>
              <Input type="color" value={qrBackground} onChange={(e) => setQrBackground(e.target.value)} className="h-8 border-0 p-0" />
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleCopyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Pay Link
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Banner + Fee Card
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleDownloadPrintableQr}>
              Download QR
            </Button>
          </div>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Printable tarpaulin banner text</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} placeholder="Banner title" />
            <Input value={bannerSubtitle} onChange={(e) => setBannerSubtitle(e.target.value)} placeholder="Banner subtitle" />
          </div>
          <input
            ref={merchantLogoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleMerchantLogoUpload}
          />
          <div className="mt-3 flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-xl border border-border bg-white">
              {merchantLogoUrl ? (
                <img src={merchantLogoUrl} alt="Merchant logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <BrandLogo className="h-8 w-8 text-paypal-blue" />
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => merchantLogoInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {uploadingLogo ? "Uploading..." : "Upload Merchant Logo"}
            </Button>
          </div>
        </div>

        <div className="paypal-surface rounded-3xl p-4">
          <p className="text-sm font-semibold text-foreground">Printable forms</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use Print Banner + Fee Card to print your merchant banner, QR, and deposit/payout fill-up forms.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleGenerateDownloadLink}>
              Generate Link
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleOpenDownloadLink} disabled={!downloadLink}>
              Open Link
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleCopyDownloadLink} disabled={!downloadLink}>
              Copy Link
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            If direct download is blocked in Pi Browser, use Generate Link then Open/Copy.
          </p>
        </div>
      </div>

      <div id="remittance-print-zone" className="mx-auto mt-4 w-full max-w-3xl space-y-4">
        <div
          className="rounded-3xl border p-6"
          style={{
            borderColor: qrAccent,
            background: `linear-gradient(135deg, ${qrAccent} 0%, #0f172a 100%)`,
          }}
        >
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">OpenPay Merchant Store</p>
              <p className="text-3xl font-extrabold text-white">{bannerTitle || "OpenPay Remittance Center"}</p>
              <p className="mt-1 text-base font-medium text-white/90">{bannerSubtitle || "Powered by Pi Network"}</p>
              <p className="mt-2 text-sm text-white/80">
                Deposit and payout services available at this remittance center.
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              {merchantLogoUrl ? (
                <img src={merchantLogoUrl} alt="Merchant logo" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <BrandLogo className="h-12 w-12 text-white" />
              )}
            </div>
          </div>
        </div>

        <div
          className="rounded-3xl border p-5"
          style={{ borderColor: qrAccent, backgroundColor: qrBackground }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: qrAccent }}>OpenPay Remittance Merchant</p>
          <p className="text-3xl font-bold text-foreground">{merchantName || "Remittance Center"}</p>
          <p className="text-sm text-muted-foreground">@{sanitizedUsername || "merchantusername"} {merchantCity ? ` - ${merchantCity}` : ""} {merchantCountry ? ` - ${merchantCountry}` : ""}</p>
          <p className="mt-2 text-sm text-foreground">{businessNote}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr,1fr]">
          <div
            className="flex flex-col items-center rounded-3xl border p-4"
            style={{ borderColor: qrAccent, backgroundColor: qrBackground }}
          >
            <QRCodeSVG
              value={qrValue || "openpay://pay"}
              size={230}
              level="H"
              includeMargin
              imageSettings={{
                src: merchantLogoUrl || "/openpay-o.svg",
                height: 34,
                width: 34,
                excavate: true,
              }}
            />
            <p className="mt-3 text-center text-sm font-semibold" style={{ color: qrAccent }}>{qrTagline || "SCAN TO DEPOSIT / PAYOUT"}</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Use this same OpenPay QR for customer deposit and payout request flow.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-white p-4">
            <p className="text-lg font-bold text-foreground">{feeTitle || "Remittance Fee Card"}</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-border p-2">
                <span className="text-muted-foreground">Deposit fee</span>
                <span className="font-semibold text-foreground">{depositFeePercent || "0.00"}%</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-2">
                <span className="text-muted-foreground">Payout fee</span>
                <span className="font-semibold text-foreground">{payoutFeePercent || "0.00"}%</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-2">
                <span className="text-muted-foreground">Flat service fee</span>
                <span className="font-semibold text-foreground">${flatServiceFee || "0.00"}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{feeNotes}</p>
            <div className="mt-3 rounded-xl border border-border bg-secondary/40 p-2 text-xs text-foreground">
              OpenPay platform fee: 0%. Merchant may add fee based on local exchange service terms.
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-white p-4">
          <p className="text-lg font-bold text-foreground">OpenPay Remittance Deposit Form</p>
          <p className="text-xs text-muted-foreground">Merchant: {merchantName || "OpenPay Remittance Center"} (@{sanitizedUsername || "merchantusername"})</p>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            <p>Customer Name: __________________________</p>
            <p>Date: __________________________</p>
            <p>Customer OpenPay Username: __________________________</p>
            <p>Reference No.: __________________________</p>
            <p>Amount to Deposit: __________________________</p>
            <p>Currency: __________________________</p>
            <p>Merchant Fee: __________________________</p>
            <p>Total Cash Received: __________________________</p>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            <p>Merchant Signature: __________________________</p>
            <p>Customer Signature: __________________________</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Merchant confirms OpenPay balance was sent to customer wallet before finalizing cash collection.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-white p-4">
          <p className="text-lg font-bold text-foreground">OpenPay Remittance Payout Form</p>
          <p className="text-xs text-muted-foreground">Merchant: {merchantName || "OpenPay Remittance Center"} (@{sanitizedUsername || "merchantusername"})</p>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            <p>Customer Name: __________________________</p>
            <p>Date: __________________________</p>
            <p>Customer OpenPay Username: __________________________</p>
            <p>Reference No.: __________________________</p>
            <p>OpenPay Balance Received: __________________________</p>
            <p>Currency: __________________________</p>
            <p>Merchant Fee Deducted: __________________________</p>
            <p>Cash Paid to Customer: __________________________</p>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            <p>Merchant Signature: __________________________</p>
            <p>Customer Signature: __________________________</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Customer must transfer OpenPay balance to merchant OpenPay wallet before cash payout release.
          </p>
        </div>

        <div className="hidden">
          <QRCodeCanvas
            id="remittance-qr-download-source"
            value={qrValue || "openpay://pay"}
            size={1024}
            level="H"
            includeMargin
            imageSettings={{
              src: downloadSafeLogoSrc,
              height: 140,
              width: 140,
              excavate: true,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default RemittanceMerchantPage;

