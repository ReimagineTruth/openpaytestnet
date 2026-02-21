import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";

type PublicLedgerEntry = {
  amount: number;
  note: string | null;
  status: string;
  occurred_at: string;
  event_type: string;
};

const PAGE_SIZE = 30;

const PublicLedgerPage = () => {
  const navigate = useNavigate();
  const { format: formatCurrency } = useCurrency();
  const [entries, setEntries] = useState<PublicLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = async (nextOffset = 0) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_public_ledger", {
        p_limit: PAGE_SIZE,
        p_offset: nextOffset,
      });

      if (error) throw new Error(error.message || "Failed to load ledger.");

      const rows = (data || []) as PublicLedgerEntry[];
      setEntries(rows);
      setOffset(nextOffset);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(0);
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} aria-label="Back to home">
            <ArrowLeft className="h-6 w-6 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-paypal-dark">Public Ledger</h1>
            <p className="text-xs text-muted-foreground">Public transaction history. User IDs are not shown.</p>
          </div>
        </div>
        <button
          onClick={() => loadPage(offset)}
          className="paypal-surface flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-foreground"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {entries.length === 0 && !loading ? (
        <p className="py-12 text-center text-muted-foreground">No ledger transactions yet.</p>
      ) : (
        <div className="paypal-surface divide-y divide-border/70 rounded-3xl">
          {entries.map((row, index) => (
            <div key={`${row.occurred_at}-${index}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">Transaction</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(row.occurred_at), "MMM d, yyyy HH:mm")} • {row.event_type}
                </p>
                {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                <p className="text-xs text-muted-foreground">Status: {row.status || "unknown"}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-paypal-success">{formatCurrency(row.amount)}</p>
                <p className="text-xs text-muted-foreground">Public record</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          className="paypal-surface h-9 rounded-full px-4 text-sm font-semibold text-foreground disabled:opacity-50"
          onClick={() => loadPage(Math.max(0, offset - PAGE_SIZE))}
          disabled={loading || offset === 0}
        >
          Previous
        </button>
        <button
          className="paypal-surface h-9 rounded-full px-4 text-sm font-semibold text-foreground disabled:opacity-50"
          onClick={() => loadPage(offset + PAGE_SIZE)}
          disabled={loading || !hasMore}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default PublicLedgerPage;
