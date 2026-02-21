import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, X } from "lucide-react";
import { format } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";

interface ReceiptData {
  transactionId: string;
  type: "send" | "receive" | "topup";
  amount: number;
  otherPartyName?: string;
  otherPartyUsername?: string;
  note?: string;
  date: Date;
}

interface TransactionReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
}

const toPreviewText = (value: string, max = 60) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const shortenToken = (token: string, keepStart = 10, keepEnd = 6) => {
    if (token.length <= keepStart + keepEnd + 3) return token;
    return `${token.slice(0, keepStart)}...${token.slice(-keepEnd)}`;
  };

  const tokenShortened = raw
    .replace(/\bopsess_[a-zA-Z0-9_-]+\b/g, (m) => shortenToken(m))
    .replace(/\boplink_[a-zA-Z0-9_-]+\b/g, (m) => shortenToken(m))
    .replace(/\bhttps?:\/\/[^\s]+/gi, (m) => shortenToken(m, 22, 10));

  if (tokenShortened.length <= max) return tokenShortened;
  return `${tokenShortened.slice(0, max - 3)}...`;
};

const TransactionReceipt = ({ open, onOpenChange, receipt }: TransactionReceiptProps) => {
  const { format: formatCurrency } = useCurrency();

  if (!receipt) return null;

  const typeLabel =
    receipt.type === "topup" ? "Top Up" : receipt.type === "send" ? "Payment Sent" : "Payment Received";
  const transactionIdPreview =
    receipt.transactionId.length > 18
      ? `${receipt.transactionId.slice(0, 10)}...${receipt.transactionId.slice(-6)}`
      : receipt.transactionId;

  const handleSave = () => {
    const text = [
      "═══════════════════════════",
      "       OpenPay Receipt      ",
      "═══════════════════════════",
      "",
      `Type: ${typeLabel}`,
      `Amount: ${formatCurrency(receipt.amount)}`,
      `Date: ${format(receipt.date, "MMM d, yyyy 'at' h:mm a")}`,
      `Transaction ID: ${receipt.transactionId}`,
      ...(receipt.otherPartyName ? [`To/From: ${receipt.otherPartyName}`] : []),
      ...(receipt.otherPartyUsername ? [`Username: @${receipt.otherPartyUsername}`] : []),
      ...(receipt.note ? [`Note: ${receipt.note}`] : []),
      "",
      "═══════════════════════════",
      "     Thank you for using    ",
      "          OpenPay           ",
      "═══════════════════════════",
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openpay-receipt-${receipt.transactionId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Transaction receipt</DialogTitle>
        <DialogDescription className="sr-only">Receipt details for the selected transaction.</DialogDescription>
        <div className="bg-gradient-to-br from-paypal-blue to-[#0073e6] p-6 text-center text-white">
          <CheckCircle className="mx-auto h-12 w-12 mb-2" />
          <h2 className="text-xl font-bold">{typeLabel}</h2>
          <p className="text-3xl font-bold mt-2">{formatCurrency(receipt.amount)}</p>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="text-foreground font-medium">{format(receipt.date, "MMM d, yyyy h:mm a")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Transaction ID</span>
            <span className="text-foreground font-mono text-xs">{transactionIdPreview}</span>
          </div>
          {receipt.otherPartyName && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{receipt.type === "send" ? "To" : "From"}</span>
              <span className="text-foreground font-medium">{receipt.otherPartyName}</span>
            </div>
          )}
          {receipt.otherPartyUsername && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Username</span>
              <span className="text-foreground">@{receipt.otherPartyUsername}</span>
            </div>
          )}
          {receipt.note && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Note</span>
              <span className="max-w-[70%] text-right text-foreground break-words">{toPreviewText(receipt.note)}</span>
            </div>
          )}

          <div className="pt-3 flex gap-2">
            <Button onClick={handleSave} className="flex-1 rounded-full bg-paypal-blue text-white">
              <Download className="mr-2 h-4 w-4" /> Save Receipt
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { ReceiptData };
export default TransactionReceipt;
