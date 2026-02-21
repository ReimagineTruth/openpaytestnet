import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url?: string | null;
}

interface Invoice {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

const SendInvoice = () => {
  const navigate = useNavigate();
  const { format: formatCurrency } = useCurrency();
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<Profile | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountLookupResult, setAccountLookupResult] = useState<Profile | null>(null);
  const [accountLookupLoading, setAccountLookupLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: "create"; recipient: Profile; amount: number; description: string; dueDate: string | null }
    | { type: "pay"; invoice: Invoice; sender: Profile | null }
    | null
  >(null);

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/signin");
      return;
    }
    setUserId(user.id);

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .neq("id", user.id);

    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("id, sender_id, recipient_id, amount, description, due_date, status, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    setProfiles(profileRows || []);
    setInvoices(invoiceRows || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedSearchRaw = search.trim();
  const isAccountNumberSearch = normalizedSearchRaw.toUpperCase().startsWith("OP");
  const normalizedUsernameSearch = normalizedSearch.startsWith("@")
    ? normalizedSearch.slice(1)
    : normalizedSearch;

  const filteredProfiles = normalizedSearch
    ? profiles.filter((p) => {
      const fullName = p.full_name.toLowerCase();
      const username = (p.username || "").toLowerCase();
      return (
        fullName.includes(normalizedSearch) ||
        username.includes(normalizedSearch) ||
        (normalizedUsernameSearch.length > 0 && username.includes(normalizedUsernameSearch))
      );
    })
    : profiles;
  const filteredWithoutAccountMatch = accountLookupResult
    ? filteredProfiles.filter((profile) => profile.id !== accountLookupResult.id)
    : filteredProfiles;

  useEffect(() => {
    const lookup = async () => {
      if (!isAccountNumberSearch || normalizedSearchRaw.length < 8) {
        setAccountLookupResult(null);
        setAccountLookupLoading(false);
        return;
      }
      setAccountLookupLoading(true);
      const { data, error } = await supabase.rpc("find_user_by_account_number", {
        p_account_number: normalizedSearchRaw.toUpperCase(),
      });
      if (error) {
        setAccountLookupResult(null);
        setAccountLookupLoading(false);
        return;
      }
      const row = (data as Profile[] | null)?.[0] || null;
      setAccountLookupResult(row);
      setAccountLookupLoading(false);
    };
    void lookup();
  }, [isAccountNumberSearch, normalizedSearchRaw]);

  const received = invoices.filter((i) => i.recipient_id === userId);
  const sent = invoices.filter((i) => i.sender_id === userId);

  const submitCreate = async () => {
    if (!userId || !recipientId) {
      toast.error("Select recipient");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("invoices").insert({
      sender_id: userId,
      recipient_id: recipientId,
      amount: parsedAmount,
      description: description.trim() || "",
      due_date: dueDate || null,
      status: "pending",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Invoice sent");
    setAmount("");
    setDescription("");
    setDueDate("");
    setRecipientId("");
    setSelectedRecipient(null);
    await loadData();
  };

  const submitPay = async (invoice: Invoice) => {
    setLoading(true);
    const { error } = await supabase.functions.invoke("send-money", {
      body: {
        receiver_id: invoice.sender_id,
        receiver_email: "__by_id__",
        amount: invoice.amount,
        note: invoice.description || "Invoice payment",
      },
    });

    if (error) {
      setLoading(false);
      toast.error(await getFunctionErrorMessage(error, "Payment failed"));
      return;
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", invoice.id);

    setLoading(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    toast.success("Invoice paid");
    await loadData();
  };

  const handleCreate = () => {
    if (!recipientId || !selectedRecipient) {
      toast.error("Select recipient");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setConfirmAction({
      type: "create",
      recipient: selectedRecipient,
      amount: parsedAmount,
      description: description.trim(),
      dueDate: dueDate || null,
    });
    setConfirmModalOpen(true);
  };

  const handlePay = (invoice: Invoice) => {
    setConfirmAction({
      type: "pay",
      invoice,
      sender: profileMap.get(invoice.sender_id) || null,
    });
    setConfirmModalOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || loading) return;

    if (confirmAction.type === "create") {
      await submitCreate();
    } else {
      await submitPay(confirmAction.invoice);
    }

    setConfirmModalOpen(false);
    setConfirmAction(null);
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")}>
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Send Invoice</h1>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={() => setShowInstructions(true)}>
          Instructions
        </Button>
      </div>

      <div className="px-4 space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Create invoice</h2>
          <Input
            placeholder="Search person by name, username, email, or account number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted-foreground">
            {selectedRecipient ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedRecipient.avatar_url ? (
                    <img src={selectedRecipient.avatar_url} alt={selectedRecipient.full_name} className="h-8 w-8 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {selectedRecipient.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedRecipient.full_name}</p>
                    {selectedRecipient.username && <p className="text-xs text-muted-foreground">@{selectedRecipient.username}</p>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3"
                  onClick={() => { setSelectedRecipient(null); setRecipientId(""); }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Select recipient</p>
                <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-border">
                  {isAccountNumberSearch && accountLookupLoading && (
                    <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">Searching account number...</p>
                  )}
                  {isAccountNumberSearch && !accountLookupLoading && accountLookupResult && (
                    <button
                      onClick={() => { setRecipientId(accountLookupResult.id); setSelectedRecipient(accountLookupResult); }}
                      className="w-full border-b border-border px-3 py-2 text-left hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        {accountLookupResult.avatar_url ? (
                          <img src={accountLookupResult.avatar_url} alt={accountLookupResult.full_name} className="h-9 w-9 rounded-full border border-border object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                            {accountLookupResult.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{accountLookupResult.full_name}</p>
                          {accountLookupResult.username && <p className="text-sm text-muted-foreground">@{accountLookupResult.username}</p>}
                          <p className="text-xs text-muted-foreground">Matched by account number</p>
                        </div>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  )}
                  {filteredWithoutAccountMatch.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setRecipientId(p.id); setSelectedRecipient(p); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt={p.full_name} className="h-9 w-9 rounded-full border border-border object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                            {p.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{p.full_name}</p>
                          {p.username && <p className="text-sm text-muted-foreground">@{p.username}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredWithoutAccountMatch.length === 0 && !accountLookupResult && !accountLookupLoading && (
                    <p className="px-3 py-4 text-sm text-muted-foreground">No users found</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button onClick={handleCreate} disabled={loading || !recipientId} className="w-full">
            {loading ? "Sending..." : "Send Invoice"}
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Received invoices</h2>
          {received.length === 0 && <p className="text-sm text-muted-foreground">No received invoices</p>}
          {received.map((invoice) => {
            const sender = profileMap.get(invoice.sender_id);
            return (
              <div key={invoice.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {sender?.avatar_url ? (
                    <img src={sender.avatar_url} alt={sender.full_name} className="h-10 w-10 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {(sender?.full_name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <p className="font-medium text-foreground">{sender?.full_name || "Unknown user"}</p>
                </div>
                <p className="text-sm text-muted-foreground">{format(new Date(invoice.created_at), "MMM d, yyyy")}</p>
                <p className="font-semibold mt-1">{formatCurrency(invoice.amount)}</p>
                {invoice.description && <p className="text-sm text-muted-foreground mt-1">{invoice.description}</p>}
                {invoice.due_date && <p className="text-sm text-muted-foreground mt-1">Due: {invoice.due_date}</p>}
                <p className="text-sm mt-1 capitalize">Status: {invoice.status}</p>
                {invoice.status === "pending" && (
                  <Button className="w-full mt-3" disabled={loading} onClick={() => handlePay(invoice)}>
                    Pay Invoice
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Sent invoices</h2>
          {sent.length === 0 && <p className="text-sm text-muted-foreground">No sent invoices</p>}
          {sent.map((invoice) => {
            const recipient = profileMap.get(invoice.recipient_id);
            return (
              <div key={invoice.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {recipient?.avatar_url ? (
                    <img src={recipient.avatar_url} alt={recipient.full_name} className="h-10 w-10 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {(recipient?.full_name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <p className="font-medium text-foreground">{recipient?.full_name || "Unknown user"}</p>
                </div>
                <p className="text-sm text-muted-foreground">{format(new Date(invoice.created_at), "MMM d, yyyy")}</p>
                <p className="font-semibold mt-1">{formatCurrency(invoice.amount)}</p>
                {invoice.description && <p className="text-sm text-muted-foreground mt-1">{invoice.description}</p>}
                {invoice.due_date && <p className="text-sm text-muted-foreground mt-1">Due: {invoice.due_date}</p>}
                <p className="text-sm mt-1 capitalize">Status: {invoice.status}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={confirmModalOpen}
        onOpenChange={(open) => {
          if (loading) return;
          setConfirmModalOpen(open);
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogTitle className="text-xl font-bold text-foreground">
            {confirmAction?.type === "create" ? "Confirm invoice" : "Confirm payment"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Review the details before sending.
          </DialogDescription>

          {(confirmAction?.type === "create" || confirmAction?.type === "pay") && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 px-3 py-2.5">
              {(confirmAction.type === "create" ? confirmAction.recipient.avatar_url : confirmAction.sender?.avatar_url) ? (
                <img
                  src={confirmAction.type === "create" ? confirmAction.recipient.avatar_url || "" : confirmAction.sender?.avatar_url || ""}
                  alt={confirmAction.type === "create" ? confirmAction.recipient.full_name : confirmAction.sender?.full_name || "User"}
                  className="h-12 w-12 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paypal-dark">
                  <span className="text-sm font-bold text-primary-foreground">
                    {getInitials(confirmAction.type === "create" ? confirmAction.recipient.full_name : confirmAction.sender?.full_name || "User")}
                  </span>
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {confirmAction.type === "create" ? confirmAction.recipient.full_name : confirmAction.sender?.full_name || "Unknown user"}
                </p>
                {(confirmAction.type === "create" ? confirmAction.recipient.username : confirmAction.sender?.username) && (
                  <p className="text-sm text-muted-foreground">
                    @{confirmAction.type === "create" ? confirmAction.recipient.username : confirmAction.sender?.username}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 rounded-2xl border border-border p-3 text-sm">
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold text-foreground">
                {confirmAction?.type === "create"
                  ? formatCurrency(confirmAction.amount)
                  : confirmAction?.type === "pay"
                    ? formatCurrency(confirmAction.invoice.amount)
                    : "-"}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Converted (USD)</span>
              <span className="font-semibold text-foreground">
                ${confirmAction?.type === "create"
                  ? confirmAction.amount.toFixed(2)
                  : confirmAction?.type === "pay"
                    ? Number(confirmAction.invoice.amount || 0).toFixed(2)
                    : "0.00"}
              </span>
            </p>
            <p className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground">Description</span>
              <span className="max-w-[70%] break-all text-right text-foreground">
                {confirmAction?.type === "create"
                  ? confirmAction.description || "No description"
                  : confirmAction?.type === "pay"
                    ? confirmAction.invoice.description || "Invoice payment"
                    : "No description"}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Due date</span>
              <span className="font-semibold text-foreground">
                {confirmAction?.type === "create"
                  ? confirmAction.dueDate || "No due date"
                  : confirmAction?.type === "pay"
                    ? confirmAction.invoice.due_date || "No due date"
                    : "No due date"}
              </span>
            </p>
          </div>

          <p className="mt-3 rounded-md border border-paypal-light-blue/60 bg-[#edf3ff] px-2 py-1 text-xs text-paypal-blue">
            Approve only if you know this user and expected this transaction. If you do not recognize the sender/recipient, cancel now.
          </p>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-2xl"
              disabled={loading}
              onClick={() => {
                setConfirmModalOpen(false);
                setConfirmAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="h-11 flex-1 rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
              disabled={loading}
              onClick={handleConfirmAction}
            >
              {loading ? "Processing..." : confirmAction?.type === "create" ? "Confirm & Send" : "Confirm & Pay"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogTitle className="text-lg font-semibold text-foreground">Invoice Instructions</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Review before sending or paying an invoice.
          </DialogDescription>
          <div className="space-y-2 text-sm text-foreground">
            <p>1. Confirm recipient or sender identity before approval.</p>
            <p>2. Verify amount, due date, and description.</p>
            <p>3. Only pay invoices from users you know and expected to transact with.</p>
            <p>4. If any detail looks wrong, cancel and verify first.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SendInvoice;
