import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Dispute {
  id: string;
  transaction_id: string;
  reason: string;
  description: string;
  status: string;
  admin_response: string | null;
  created_at: string;
}

const DisputesPage = () => {
  const navigate = useNavigate();
  const { format: formatCurrency } = useCurrency();
  const [userId, setUserId] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [transactionId, setTransactionId] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/signin"); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from("disputes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setDisputes((data as Dispute[]) || []);
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async () => {
    if (!userId || !transactionId.trim() || !reason.trim()) {
      toast.error("Transaction ID and reason are required");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("disputes").insert({
      user_id: userId,
      transaction_id: transactionId.trim(),
      reason: reason.trim(),
      description: description.trim(),
      status: "open",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Dispute submitted successfully");
    setTransactionId("");
    setReason("");
    setDescription("");
    await loadData();
  };

  const statusColor = (status: string) => {
    if (status === "open") return "bg-yellow-100 text-yellow-800";
    if (status === "resolved") return "bg-green-100 text-green-800";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center gap-3 px-4 pt-4 mb-4">
        <button onClick={() => navigate("/menu")}>
          <ArrowLeft className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Disputes</h1>
      </div>

      <div className="px-4 space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">File a Dispute</h2>
          <p className="text-sm text-muted-foreground">
            Enter the Transaction ID from your receipt to dispute a transaction.
          </p>
          <Input
            placeholder="Transaction ID"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
          <Input
            placeholder="Reason (e.g., Unauthorized, Wrong amount)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Textarea
            placeholder="Describe the issue in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Submit Dispute"}
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Your Disputes</h2>
          {disputes.length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes filed yet</p>
          )}
          {disputes.map((d) => (
            <div key={d.id} className="border border-border rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground text-sm">TX: {d.transaction_id.slice(0, 12)}...</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>
                  {d.status}
                </span>
              </div>
              <p className="text-sm text-foreground">{d.reason}</p>
              {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
              <p className="text-xs text-muted-foreground">{format(new Date(d.created_at), "MMM d, yyyy")}</p>
              {d.admin_response && (
                <div className="mt-2 rounded-lg bg-muted p-2">
                  <p className="text-xs font-medium text-foreground">Admin Response:</p>
                  <p className="text-xs text-muted-foreground">{d.admin_response}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DisputesPage;
