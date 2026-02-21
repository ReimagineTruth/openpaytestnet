import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/contexts/CurrencyContext";
import { toast } from "sonner";
import { loadUserPreferences, upsertUserPreferences } from "@/lib/userPreferences";

interface SelfProfile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
}

const ReceivePage = () => {
  const navigate = useNavigate();
  const { currencies, currency } = useCurrency();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currency.code);
  const [storeQrName, setStoreQrName] = useState("OpenPay Store");
  const [storeMerchantUsername, setStoreMerchantUsername] = useState("");
  const [storeQrTagline, setStoreQrTagline] = useState("SCAN TO PAY");
  const [storeQrAccent, setStoreQrAccent] = useState("#2148ff");
  const [storeQrBackground, setStoreQrBackground] = useState("#ffffff");
  const [storeQrDesign, setStoreQrDesign] = useState<"clean" | "gradient" | "badge">("clean");
  const [printSize, setPrintSize] = useState<"small" | "medium" | "large">("large");
  const [userId, setUserId] = useState<string | null>(null);
  const [qrPrefsLoaded, setQrPrefsLoaded] = useState(false);
  const [downloadLink, setDownloadLink] = useState("");

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

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", user.id)
        .single();

      setProfile(data || null);
      if (data?.username) setStoreMerchantUsername(data.username);

      try {
        const prefs = await loadUserPreferences(user.id);
        const qr = prefs.qr_print_settings;
        if (typeof qr.name === "string" && qr.name.trim()) setStoreQrName(qr.name);
        if (typeof qr.merchantUsername === "string") setStoreMerchantUsername(qr.merchantUsername);
        if (typeof qr.tagline === "string" && qr.tagline.trim()) setStoreQrTagline(qr.tagline);
        if (typeof qr.accent === "string" && qr.accent.trim()) setStoreQrAccent(qr.accent);
        if (typeof qr.background === "string" && qr.background.trim()) setStoreQrBackground(qr.background);
        if (qr.design === "clean" || qr.design === "gradient" || qr.design === "badge") {
          setStoreQrDesign(qr.design);
        }
        if (qr.size === "small" || qr.size === "medium" || qr.size === "large") {
          setPrintSize(qr.size);
        }
      } catch {
        // Keep defaults when DB preference is unavailable.
      } finally {
        setQrPrefsLoaded(true);
      }
    };

    load();
  }, [navigate]);

  useEffect(() => {
    if (!currencies.find((c) => c.code === currencyCode)) {
      setCurrencyCode(currency.code);
    }
  }, [currencies, currency.code, currencyCode]);

  const parsedAmount = Number(amount);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount.toFixed(2) : "";

  const receiveQrValue = useMemo(() => {
    if (!profile?.id) return "";
    const params = new URLSearchParams({
      uid: profile.id,
      name: profile.full_name || "",
      username: profile.username || "",
      currency: currencyCode,
    });
    if (normalizedAmount) params.set("amount", normalizedAmount);
    return `openpay://pay?${params.toString()}`;
  }, [currencyCode, normalizedAmount, profile?.full_name, profile?.id, profile?.username]);

  const webPayLink = useMemo(() => {
    if (!profile?.id || typeof window === "undefined") return "";
    const params = new URLSearchParams({
      to: profile.id,
      currency: currencyCode,
    });
    if (normalizedAmount) params.set("amount", normalizedAmount);
    return `${window.location.origin}/send?${params.toString()}`;
  }, [currencyCode, normalizedAmount, profile?.id]);

  const shortDisplayLink = useMemo(() => {
    if (!webPayLink) return "";
    try {
      const url = new URL(webPayLink);
      const to = url.searchParams.get("to") || "";
      const safeTo = to.length > 10 ? `${to.slice(0, 6)}...${to.slice(-4)}` : to;
      const hasAmount = Boolean(url.searchParams.get("amount"));
      return `${url.origin}/send?to=${safeTo}${hasAmount ? "&amount=..." : ""}&currency=${currencyCode}`;
    } catch {
      return webPayLink.length > 48 ? `${webPayLink.slice(0, 48)}...` : webPayLink;
    }
  }, [webPayLink, currencyCode]);

  const handleCopy = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed. Please try again.");
    }
  };

  const handleShare = async (value: string) => {
    if (!value) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "OpenPay payment request",
          text: "Pay me securely on OpenPay.",
          url: value,
        });
        return;
      } catch {
        // Fall back to copy.
      }
    }
    await handleCopy(value, "Link");
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "OP";
  const getPiCodeLabel = (code: string) => (code === "PI" ? "PI" : `PI ${code}`);
  const normalizedMerchantUsername = storeMerchantUsername.trim().replace(/^@+/, "");

  const printSizeConfig = useMemo(() => {
    if (printSize === "small") {
      return { qrSize: 170, cardWidth: 280, exportWidth: 720, exportHeight: 1120 };
    }
    if (printSize === "medium") {
      return { qrSize: 210, cardWidth: 330, exportWidth: 900, exportHeight: 1320 };
    }
    return { qrSize: 250, cardWidth: 380, exportWidth: 1080, exportHeight: 1560 };
  }, [printSize]);

  const handlePrintStoreQr = () => {
    window.print();
  };

  useEffect(() => {
    if (!userId || !qrPrefsLoaded) return;
    const timer = window.setTimeout(() => {
      upsertUserPreferences(userId, {
        qr_print_settings: {
          name: storeQrName,
          merchantUsername: normalizedMerchantUsername,
          tagline: storeQrTagline,
          accent: storeQrAccent,
          background: storeQrBackground,
          design: storeQrDesign,
          size: printSize,
        },
      }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    userId,
    qrPrefsLoaded,
    storeQrName,
    normalizedMerchantUsername,
    storeQrTagline,
    storeQrAccent,
    storeQrBackground,
    storeQrDesign,
    printSize,
  ]);

  const buildPrintableQrPng = () => {
    const sourceCanvas = document.getElementById("store-qr-download-source") as HTMLCanvasElement | null;
    if (!sourceCanvas) throw new Error("QR not ready yet");

    const { exportWidth, exportHeight } = printSizeConfig;
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Download failed");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    const margin = Math.round(exportWidth * 0.06);
    const cardW = exportWidth - margin * 2;
    const cardH = exportHeight - margin * 2;

    ctx.strokeStyle = storeQrAccent;
    ctx.lineWidth = Math.max(4, Math.round(exportWidth * 0.005));
    const radius = Math.round(exportWidth * 0.03);
    ctx.fillStyle = storeQrBackground;
    ctx.beginPath();
    ctx.moveTo(margin + radius, margin);
    ctx.lineTo(margin + cardW - radius, margin);
    ctx.quadraticCurveTo(margin + cardW, margin, margin + cardW, margin + radius);
    ctx.lineTo(margin + cardW, margin + cardH - radius);
    ctx.quadraticCurveTo(margin + cardW, margin + cardH, margin + cardW - radius, margin + cardH);
    ctx.lineTo(margin + radius, margin + cardH);
    ctx.quadraticCurveTo(margin, margin + cardH, margin, margin + cardH - radius);
    ctx.lineTo(margin, margin + radius);
    ctx.quadraticCurveTo(margin, margin, margin + radius, margin);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (storeQrDesign === "gradient") {
      const gradient = ctx.createLinearGradient(0, margin, 0, margin + cardH);
      gradient.addColorStop(0, `${storeQrAccent}20`);
      gradient.addColorStop(1, storeQrBackground);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.stroke();
    }

    if (storeQrDesign === "badge") {
      const headerH = Math.round(cardH * 0.18);
      ctx.fillStyle = storeQrAccent;
      ctx.beginPath();
      ctx.moveTo(margin + radius, margin);
      ctx.lineTo(margin + cardW - radius, margin);
      ctx.quadraticCurveTo(margin + cardW, margin, margin + cardW, margin + radius);
      ctx.lineTo(margin + cardW, margin + headerH);
      ctx.lineTo(margin, margin + headerH);
      ctx.lineTo(margin, margin + radius);
      ctx.quadraticCurveTo(margin, margin, margin + radius, margin);
      ctx.closePath();
      ctx.fill();
    }

    const centerX = exportWidth / 2;
    const topY = margin + Math.round(exportHeight * 0.09);
    ctx.fillStyle = storeQrDesign === "badge" ? "#ffffff" : storeQrAccent;
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(exportWidth * 0.08)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText("OpenPay", centerX, topY);

    ctx.fillStyle = storeQrDesign === "badge" ? "#e5e7eb" : "#111827";
    ctx.font = `600 ${Math.round(exportWidth * 0.042)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(storeQrName || "OpenPay Store", centerX, topY + Math.round(exportHeight * 0.06));

    const qrSize = Math.round(exportWidth * 0.52);
    const qrX = centerX - qrSize / 2;
    const qrY = topY + Math.round(exportHeight * 0.1);
    ctx.drawImage(sourceCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#4b5563";
    ctx.font = `700 ${Math.round(exportWidth * 0.03)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(storeQrTagline || "SCAN TO PAY", centerX, qrY + qrSize + Math.round(exportHeight * 0.07));

    ctx.fillStyle = "#6b7280";
    ctx.font = `500 ${Math.round(exportWidth * 0.022)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(
      normalizedMerchantUsername ? `Manual pay: @${normalizedMerchantUsername}` : "Manual pay in OpenPay app",
      centerX,
      margin + cardH - Math.round(exportHeight * 0.08),
    );
    ctx.fillText("Powered by OpenPay", centerX, margin + cardH - Math.round(exportHeight * 0.045));

    const fileSafeName = (storeQrName || "openpay-store")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return {
      dataUrl: canvas.toDataURL("image/png"),
      fileName: `${fileSafeName || "openpay-store"}-printable-qr.png`,
    };
  };

  const handleDownloadPrintableQr = () => {
    try {
      const { dataUrl, fileName } = buildPrintableQrPng();
      setDownloadLink(dataUrl);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      link.click();
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
      toast.error(error instanceof Error ? error.message : "Could not generate link");
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

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-store-qr-wrapper,
          #print-store-qr-wrapper * {
            visibility: visible !important;
          }
          #print-store-qr-wrapper {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #ffffff !important;
          }
          #print-store-qr-card {
            box-shadow: none !important;
            margin: 0 auto !important;
          }
        }
      `}</style>
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")}><ArrowLeft className="h-6 w-6 text-foreground" /></button>
        <h1 className="text-xl font-bold text-paypal-dark">Receive</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5">
        <div className="mb-5 flex items-center gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Profile avatar" className="h-14 w-14 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paypal-blue text-lg font-bold text-white">{initials}</div>
          )}
          <div>
            <p className="font-semibold text-foreground">{profile?.full_name || "OpenPay User"}</p>
            {profile?.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Custom Amount (optional)</p>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 25.00"
              className="h-12 rounded-2xl bg-white"
            />
          </div>

          <div>
            <p className="mb-1 text-sm text-muted-foreground">Currency</p>
            <select
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              className="h-12 w-full rounded-2xl border border-input bg-white px-3 text-sm text-foreground"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {getPiCodeLabel(c.code)} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-white p-4">
          <div className="flex justify-center">
            {receiveQrValue ? (
              <QRCodeSVG
                value={receiveQrValue}
                size={210}
                level="H"
                includeMargin
                imageSettings={{
                  src: "/openpay-o.svg",
                  height: 34,
                  width: 34,
                  excavate: true,
                }}
              />
            ) : null}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Sender can scan this QR in Express Send to auto-fill your details.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment request link</p>
            <p className="mt-1 break-all text-sm text-foreground">{shortDisplayLink || "Loading link..."}</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-2xl"
                onClick={() => handleCopy(webPayLink, "Payment request link")}
                disabled={!webPayLink}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
              <Button
                type="button"
                className="h-10 flex-1 rounded-2xl"
                onClick={() => handleShare(webPayLink)}
                disabled={!webPayLink}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share this link in social media or messages to request payment.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenPay QR link</p>
            <p className="mt-1 break-all text-sm text-foreground">{receiveQrValue || "Loading link..."}</p>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-2xl"
                onClick={() => handleCopy(receiveQrValue, "QR link")}
                disabled={!receiveQrValue}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy QR Link
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Use this when the sender is opening the OpenPay app directly.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-3 print:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Printable Store QR</p>
            <div className="mt-3 grid gap-2">
              <Input
                value={storeQrName}
                onChange={(e) => setStoreQrName(e.target.value)}
                placeholder="Store name"
                className="h-11 rounded-xl bg-white"
              />
              <Input
                value={storeMerchantUsername}
                onChange={(e) => setStoreMerchantUsername(e.target.value)}
                placeholder="Merchant username (for manual payment)"
                className="h-11 rounded-xl bg-white"
              />
              <Input
                value={storeQrTagline}
                onChange={(e) => setStoreQrTagline(e.target.value)}
                placeholder="Tagline"
                className="h-11 rounded-xl bg-white"
              />
              <label className="text-xs text-muted-foreground">
                Accent Color
                <input
                  type="color"
                  value={storeQrAccent}
                  onChange={(e) => setStoreQrAccent(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-white p-1"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Card Background
                <input
                  type="color"
                  value={storeQrBackground}
                  onChange={(e) => setStoreQrBackground(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-white p-1"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Design Template
                <select
                  value={storeQrDesign}
                  onChange={(e) => setStoreQrDesign(e.target.value as "clean" | "gradient" | "badge")}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground"
                >
                  <option value="clean">Clean</option>
                  <option value="gradient">Gradient</option>
                  <option value="badge">Badge Header</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Print Size
                <select
                  value={printSize}
                  onChange={(e) => setPrintSize(e.target.value as "small" | "medium" | "large")}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Customize then print this as your store counter QR.
            </p>
          </div>

          <div id="print-store-qr-wrapper">
            <div
              id="print-store-qr-card"
              className="mx-auto rounded-3xl border-2 p-5 shadow-sm"
              style={{
                borderColor: storeQrAccent,
                width: `${printSizeConfig.cardWidth}px`,
                maxWidth: "100%",
                background:
                  storeQrDesign === "gradient"
                    ? `linear-gradient(180deg, ${storeQrAccent}20 0%, ${storeQrBackground} 100%)`
                    : storeQrBackground,
              }}
            >
              <div
                className="mb-3 -mx-5 -mt-5 rounded-t-3xl px-5 py-3"
                style={storeQrDesign === "badge" ? { backgroundColor: storeQrAccent } : undefined}
              >
                <p
                  className="text-center text-2xl font-bold tracking-tight"
                  style={{ color: storeQrDesign === "badge" ? "#ffffff" : storeQrAccent }}
                >
                  OpenPay
                </p>
                <p className="mt-1 text-center text-sm font-semibold" style={{ color: storeQrDesign === "badge" ? "#e5e7eb" : "#1f2937" }}>
                  {storeQrName || "OpenPay Store"}
                </p>
              </div>

              <div className="mt-1 flex justify-center">
                {receiveQrValue ? (
                  <QRCodeSVG
                    value={receiveQrValue}
                    size={printSizeConfig.qrSize}
                    level="H"
                    includeMargin
                    imageSettings={{
                      src: "/openpay-o.svg",
                      height: 30,
                      width: 30,
                      excavate: true,
                    }}
                  />
                ) : null}
              </div>
              <p className="mt-3 text-center text-xs font-semibold tracking-wide text-muted-foreground">
                {storeQrTagline || "SCAN TO PAY"}
              </p>
              <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
                {normalizedMerchantUsername ? `Manual pay: @${normalizedMerchantUsername}` : "Manual payment available in OpenPay app"}
              </p>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Powered by OpenPay
              </p>
            </div>
          </div>

          <div className="flex gap-2 print:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-2xl"
              onClick={handleDownloadPrintableQr}
            >
              Download Printable QR
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-2xl"
              onClick={handlePrintStoreQr}
            >
              Print Store QR
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-white p-3 print:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Download link fallback</p>
            <p className="mt-1 text-xs text-muted-foreground">
              If Pi Browser blocks download, generate a link and open/copy it in another browser.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" onClick={handleGenerateDownloadLink}>
                Generate Link
              </Button>
              <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" onClick={handleOpenDownloadLink} disabled={!downloadLink}>
                Open Link
              </Button>
            </div>
            <div className="mt-2 flex gap-2">
              <Input value={downloadLink ? "data:image/png;base64,...(generated)" : ""} readOnly className="h-10 rounded-xl bg-white/70" />
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleCopyDownloadLink} disabled={!downloadLink}>
                Copy
              </Button>
            </div>
          </div>

          <div className="hidden">
            {receiveQrValue ? (
              <QRCodeCanvas
                id="store-qr-download-source"
                value={receiveQrValue}
                size={1024}
                level="H"
                includeMargin
                imageSettings={{
                  src: "/openpay-o.svg",
                  height: 140,
                  width: 140,
                  excavate: true,
                }}
              />
            ) : null}
          </div>

          <Button className="h-12 w-full rounded-2xl" onClick={() => navigate("/send")}>
            Open Express Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceivePage;
