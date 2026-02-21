import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";

type PiPlatformPayload = {
  success?: boolean;
  error?: string;
  data?: unknown;
};

type PiPaymentData = {
  identifier?: string;
  amount?: number;
  memo?: string;
  transaction?: {
    txid?: string;
    _link?: string;
  } | null;
};

const A2UPaymentsPage = () => {
  const navigate = useNavigate();
  const fixedPayoutAmount = 0.01;
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiverUid, setReceiverUid] = useState("");
  const memo = "OpenPay Testnet payout";
  const [paymentId, setPaymentId] = useState("");
  const [txid, setTxid] = useState("");
  const [explorerLink, setExplorerLink] = useState("");
  const [configReady, setConfigReady] = useState(false);

  const callPiPlatform = async (body: Record<string, unknown>, fallbackError: string) => {
    const { data, error } = await supabase.functions.invoke("pi-platform", { body });
    if (error) throw new Error(await getFunctionErrorMessage(error, fallbackError));
    return (data || {}) as PiPlatformPayload;
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const [{ data: userResult }, configPayload] = await Promise.all([
          supabase.auth.getUser(),
          callPiPlatform({ action: "a2u_config_status" }, "Failed to load A2U config status"),
        ]);

        const piUid = String(userResult.user?.user_metadata?.pi_uid || "").trim();
        if (piUid) setReceiverUid(piUid);

        const status = (configPayload.data || {}) as {
          hasApiKey?: boolean;
          hasValidationKey?: boolean;
          hasWalletPrivateSeed?: boolean;
          hasWalletPublicAddress?: boolean;
        };
        setConfigReady(
          Boolean(status.hasApiKey) &&
          Boolean(status.hasValidationKey) &&
          Boolean(status.hasWalletPrivateSeed) &&
          Boolean(status.hasWalletPublicAddress),
        );
      } catch {
        setConfigReady(false);
      }
    };
    void boot();
  }, []);

  const handleRequestPayout = async () => {
    if (!receiverUid.trim()) {
      toast.error("Missing Pi UID. Authenticate with Pi first.");
      return;
    }
    if (!configReady) {
      toast.error("A2U server config is incomplete");
      return;
    }

    setLoading(true);
    setPaymentId("");
    setTxid("");
    setExplorerLink("");

    try {
      const payoutMemo = memo.trim() || "OpenPay Testnet payout";
      const createPayload = await callPiPlatform(
        {
          action: "a2u_create",
          payment: {
            uid: receiverUid.trim(),
            amount: fixedPayoutAmount,
            memo: payoutMemo,
            metadata: {
              feature: "a2u_request_payout",
              source: "openpay",
              requested_at: new Date().toISOString(),
            },
          },
        },
        "Failed to create payout",
      );

      const createdPayment = (createPayload.data || {}) as PiPaymentData;
      const createdPaymentId = String(createdPayment.identifier || "").trim();
      if (!createdPaymentId) {
        throw new Error("Pi API did not return a payment identifier");
      }

      await callPiPlatform(
        { action: "a2u_approve", paymentId: createdPaymentId },
        "Failed to approve payout",
      );

      const fetchedPayload = await callPiPlatform(
        { action: "a2u_get", paymentId: createdPaymentId },
        "Failed to fetch payout status",
      );
      const fetchedPayment = (fetchedPayload.data || {}) as PiPaymentData;
      const fetchedTxid = String(fetchedPayment.transaction?.txid || "").trim();

      await callPiPlatform(
        { action: "a2u_complete", paymentId: createdPaymentId, txid: fetchedTxid || undefined },
        "Failed to complete payout",
      );

      const finalPayload = await callPiPlatform(
        { action: "a2u_get", paymentId: createdPaymentId },
        "Failed to load final payout status",
      );
      const finalPayment = (finalPayload.data || {}) as PiPaymentData;
      const finalTxid = String(finalPayment.transaction?.txid || fetchedTxid || "").trim();
      const finalLink = String(finalPayment.transaction?._link || "").trim();

      setPaymentId(createdPaymentId);
      setTxid(finalTxid);
      setExplorerLink(finalLink);
      toast.success("Payout submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payout request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/menu")}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-paypal-dark">A2U Request Payout</h1>
          <p className="text-xs text-muted-foreground">Testnet app-to-user payout modal</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-paypal-blue to-[#0073e6] p-5 text-white shadow-xl shadow-[#004bba]/20">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4" />
          <p className="text-sm font-semibold uppercase tracking-wide">Testnet Payout</p>
        </div>
        <p className="mt-2 text-sm text-white/90">
          Open the modal and request a payout using your Pi UID. This runs create, approve, and complete via A2U API.
        </p>
        <Button
          type="button"
          className="mt-4 h-12 w-full rounded-2xl bg-white text-lg font-bold text-paypal-blue hover:bg-white/90"
          onClick={() => setShowPayoutModal(true)}
        >
          Request Testnet Payout
        </Button>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full rounded-2xl border-white/60 bg-white/10 font-semibold text-white hover:bg-white/20"
          onClick={() => navigate("/topup")}
        >
          Request Top Up
        </Button>
      </div>

      <BottomNav active="menu" />

      <Dialog open={showPayoutModal} onOpenChange={setShowPayoutModal}>
        <DialogContent className="rounded-[32px] border-0 bg-[#f5f5f7] p-6 sm:max-w-[520px]">
          <DialogTitle className="text-5xl font-bold text-paypal-dark">Testnet Payouts</DialogTitle>
          <DialogDescription className="pt-1 text-base text-slate-500">
            Click the button below to receive a 0.01 Pi app-to-user payout to your testnet Pi wallet. You must be
            authenticated in Pi Browser to continue.
          </DialogDescription>

          <Button
            type="button"
            className="h-14 w-full rounded-2xl bg-paypal-blue text-3xl font-bold text-white hover:bg-[#004dc5]"
            disabled={loading || !configReady}
            onClick={handleRequestPayout}
          >
            {loading ? "Submitting..." : "Receive your 0.01 Testnet Pi"}
          </Button>

          {(paymentId || txid) && (
            <div className="space-y-2 text-sm text-slate-500">
              <p className="break-all">Payout submitted - tx: {txid || "Pending txid from Pi API"}</p>
              <p className="break-all">Payment ID: {paymentId || "-"}</p>
              {explorerLink && (
                <a
                  href={explorerLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-paypal-blue underline underline-offset-2"
                >
                  {explorerLink}
                </a>
              )}
            </div>
          )}

          {!configReady && (
            <p className="text-sm text-destructive">
              A2U server config missing. Set Pi secrets in Supabase function environment and redeploy `pi-platform`.
            </p>
          )}

          <p className="text-sm text-slate-600">
            This is for OpenPay developer payouts testing (A2U). Only 0.01 pi per click is allowed.
          </p>

          <Button
            type="button"
            className="h-14 w-full rounded-2xl bg-paypal-blue text-3xl font-bold text-white hover:bg-[#004dc5]"
            onClick={() => setShowPayoutModal(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-2xl border-paypal-blue/25 bg-white text-base font-semibold text-paypal-blue hover:bg-slate-100"
            onClick={() => {
              setShowPayoutModal(false);
              navigate("/topup");
            }}
          >
            Go to Top Up
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default A2UPaymentsPage;
