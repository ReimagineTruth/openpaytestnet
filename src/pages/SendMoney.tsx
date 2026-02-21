import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, Info, ScanLine, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";
import CurrencySelector from "@/components/CurrencySelector";
import TransactionReceipt, { type ReceiptData } from "@/components/TransactionReceipt";

interface UserProfile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url?: string | null;
}

interface RecentRecipient extends UserProfile {
  last_sent_at: string;
}

const SendMoney = () => {
  const [step, setStep] = useState<"select" | "amount" | "confirm">("select");
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [balance, setBalance] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myFullName, setMyFullName] = useState("");
  const [accountLookupResult, setAccountLookupResult] = useState<UserProfile | null>(null);
  const [accountLookupLoading, setAccountLookupLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currencies, currency, setCurrency, format: formatCurrency } = useCurrency();
  const checkoutSessionToken = searchParams.get("checkout_session") || "";
  const checkoutCustomerName = searchParams.get("checkout_customer_name") || "";
  const checkoutCustomerEmail = searchParams.get("checkout_customer_email") || "";
  const checkoutCustomerPhone = searchParams.get("checkout_customer_phone") || "";
  const checkoutCustomerAddress = searchParams.get("checkout_customer_address") || "";
  const formatShortText = (value: string, head = 28, tail = 18) => {
    const cleaned = value.trim();
    if (cleaned.length <= head + tail + 3) return cleaned;
    return `${cleaned.slice(0, head)}...${cleaned.slice(-tail)}`;
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/signin"); return; }

      const { data: wallet } = await supabase
        .from("wallets").select("balance").eq("user_id", user.id).single();
      setBalance(wallet?.balance || 0);

      const { data: myProfile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();
      setMyAvatarUrl(myProfile?.avatar_url || null);
      setMyFullName(myProfile?.full_name || "");

      const { data: contactRows } = await supabase
        .from("contacts").select("contact_id").eq("user_id", user.id);
      const contactIds = contactRows?.map(c => c.contact_id) || [];
      setContactIds(contactIds);

      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name, username, avatar_url").neq("id", user.id);

      if (profiles) {
        setAllUsers(profiles);
        setContacts(profiles.filter(p => contactIds.includes(p.id)));
      }

      const { data: txs } = await supabase
        .from("transactions")
        .select("sender_id, receiver_id, created_at")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (txs && profiles) {
        const seen = new Set<string>();
        const recent: RecentRecipient[] = [];
        for (const tx of txs) {
          const recipientId = tx.receiver_id;
          if (!recipientId || seen.has(recipientId) || recipientId === user.id) continue;
          const profile = profiles.find((p) => p.id === recipientId);
          if (!profile) continue;
          seen.add(recipientId);
          recent.push({
            ...profile,
            last_sent_at: tx.created_at,
          });
          if (recent.length >= 8) break;
        }
        setRecentRecipients(recent);
      }

      const toId = searchParams.get("to");
      const qrAmount = searchParams.get("amount");
      const qrCurrency = (searchParams.get("currency") || "").toUpperCase();
      const qrNote = searchParams.get("note");
      if (toId && profiles) {
        const found = profiles.find(p => p.id === toId);
        if (found) {
          setSelectedUser(found);
          if (qrAmount && Number.isFinite(Number(qrAmount)) && Number(qrAmount) > 0) {
            setAmount(Number(qrAmount).toFixed(2));
          }
          if (qrNote) {
            setNote(qrNote);
          }
          if (qrCurrency) {
            const foundCurrency = currencies.find((c) => c.code === qrCurrency);
            if (foundCurrency) setCurrency(foundCurrency);
          }
          setStep("amount");
        }
      }
    };
    load();
  }, [currencies, navigate, searchParams, setCurrency]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const normalizedSearchRaw = searchQuery.trim();
  const isAccountNumberSearch = normalizedSearchRaw.toUpperCase().startsWith("OP");
  const normalizedUsernameSearch = normalizedSearch.startsWith("@")
    ? normalizedSearch.slice(1)
    : normalizedSearch;

  const filtered = normalizedSearch
    ? allUsers.filter((u) => {
        const fullName = u.full_name.toLowerCase();
        const username = (u.username || "").toLowerCase();
        return (
          fullName.includes(normalizedSearch) ||
          username.includes(normalizedSearch) ||
          (normalizedUsernameSearch.length > 0 && username.includes(normalizedUsernameSearch))
        );
      })
    : contacts;
  const filteredWithoutAccountMatch = accountLookupResult
    ? filtered.filter((user) => user.id !== accountLookupResult.id)
    : filtered;

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
      const row = (data as UserProfile[] | null)?.[0] || null;
      setAccountLookupResult(row);
      setAccountLookupLoading(false);
    };
    void lookup();
  }, [isAccountNumberSearch, normalizedSearchRaw]);

  const toggleBookmark = async (profile: UserProfile) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) return;

    const isSaved = contactIds.includes(profile.id);
    if (isSaved) {
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("user_id", userId)
        .eq("contact_id", profile.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setContactIds((prev) => prev.filter((id) => id !== profile.id));
      setContacts((prev) => prev.filter((p) => p.id !== profile.id));
      toast.success("Removed from bookmarks");
      return;
    }

    const { error } = await supabase
      .from("contacts")
      .insert({ user_id: userId, contact_id: profile.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    setContactIds((prev) => [...prev, profile.id]);
    setContacts((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
    toast.success("Saved to bookmarks");
  };

  const handleSelectUser = (user: UserProfile) => { setSelectedUser(user); setShowConfirm(true); };
  const handleConfirmUser = () => { setShowConfirm(false); setStep("amount"); };

  const handleSend = async () => {
    const parsedAmount = parseFloat(amount);
    if (!selectedUser || !amount || parsedAmount <= 0) { toast.error("Enter a valid amount"); return; }
    const usdAmount = parsedAmount / currency.rate;
    if (usdAmount > balance) { toast.error("Amount exceeds your available balance"); return; }
    setLoading(true);

    const transferViaSecureRpcFallback = async () => {
      const { data: txId, error: rpcError } = await supabase.rpc("transfer_funds_authenticated", {
        p_receiver_id: selectedUser.id,
        p_amount: usdAmount,
        p_note: note || "",
      });
      if (rpcError) {
        const rpcMessage =
          typeof (rpcError as { message?: unknown })?.message === "string"
            ? (rpcError as { message: string }).message
            : "Fallback transfer failed";
        throw new Error(rpcMessage);
      }
      return String(txId || "");
    };

    let txId = "";
    let usedFallback = false;

    const { data, error } = await supabase.functions.invoke("send-money", {
      body: { receiver_id: selectedUser.id, amount: usdAmount, note },
    });

    if (error) {
      try {
        txId = await transferViaSecureRpcFallback();
        usedFallback = true;
      } catch (fallbackError) {
        const edgeErrorMessage = await getFunctionErrorMessage(error, "Transfer failed");
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : typeof (fallbackError as { message?: unknown })?.message === "string"
              ? String((fallbackError as { message: string }).message)
              : "Fallback transfer failed";
        setLoading(false);
        toast.error(`${edgeErrorMessage}. ${fallbackErrorMessage}`);
        return;
      }
    } else {
      txId = (data as { transaction_id?: string } | null)?.transaction_id || "";
    }

    if (checkoutSessionToken && txId) {
      const { error: completeError } = await (supabase as any).rpc("complete_merchant_checkout_with_transaction", {
        p_session_token: checkoutSessionToken,
        p_transaction_id: txId,
        p_note: "Completed via OpenPay wallet /send flow",
        p_customer_name: checkoutCustomerName || null,
        p_customer_email: checkoutCustomerEmail || null,
        p_customer_phone: checkoutCustomerPhone || null,
        p_customer_address: checkoutCustomerAddress || null,
      });
      if (completeError) {
        const { error: fallbackCompleteError } = await (supabase as any).rpc("complete_merchant_checkout_with_transaction", {
          p_session_token: checkoutSessionToken,
          p_transaction_id: txId,
          p_note: "Completed via OpenPay wallet /send flow",
        });
        if (fallbackCompleteError) {
          toast.error(`Payment sent, but checkout completion failed: ${fallbackCompleteError.message}`);
        } else {
          toast.message("Payment completed, but customer checkout details were not saved.");
          navigate(`/merchant-checkout?session=${encodeURIComponent(checkoutSessionToken)}&status=paid&tx=${encodeURIComponent(txId)}`, { replace: true });
          setLoading(false);
          return;
        }
      } else {
        navigate(`/merchant-checkout?session=${encodeURIComponent(checkoutSessionToken)}&status=paid&tx=${encodeURIComponent(txId)}`, { replace: true });
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setReceiptData({
      transactionId: txId,
      type: "send",
      amount: usdAmount,
      otherPartyName: selectedUser.full_name,
      otherPartyUsername: selectedUser.username || undefined,
      note: note || undefined,
      date: new Date(),
    });
    setReceiptOpen(true);
    if (usedFallback) {
      toast.success(`${currency.symbol}${parseFloat(amount).toFixed(2)} sent to ${selectedUser.full_name}! (fallback route)`);
    } else {
      toast.success(`${currency.symbol}${parseFloat(amount).toFixed(2)} sent to ${selectedUser.full_name}!`);
    }
  };

  const handleOpenSendConfirm = () => {
    const parsedAmount = parseFloat(amount);
    if (!selectedUser || !amount || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const usdAmount = parsedAmount / currency.rate;
    if (usdAmount > balance) {
      toast.error("Amount exceeds your available balance");
      return;
    }
    setShowSendConfirm(true);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-paypal-dark", "bg-paypal-light-blue", "bg-primary", "bg-muted-foreground"];
  const renderAvatar = (user: UserProfile, colorIndex: number) => (
    user.avatar_url ? (
      <img src={user.avatar_url} alt={user.full_name} className="h-12 w-12 rounded-full object-cover border border-border" />
    ) : (
      <div className={`w-12 h-12 rounded-full ${colors[colorIndex % colors.length]} flex items-center justify-center`}>
        <span className="text-sm font-bold text-primary-foreground">{getInitials(user.full_name)}</span>
      </div>
    )
  );

  if (step === "amount") {
    return (
      <div className="min-h-screen bg-background px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep("select")}><ArrowLeft className="w-6 h-6 text-foreground" /></button>
            <h1 className="text-lg font-semibold text-paypal-dark">Express Send</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/scan-qr?returnTo=/send")}
              className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
              aria-label="Scan QR code"
            >
              <ScanLine className="h-4 w-4 text-foreground" />
            </button>
            <CurrencySelector />
          </div>
        </div>

        {selectedUser && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-secondary/80 px-3 py-2.5">
            {selectedUser.avatar_url ? (
              <img
                src={selectedUser.avatar_url}
                alt={selectedUser.full_name}
                className="h-12 w-12 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paypal-dark">
                <span className="text-sm font-bold text-primary-foreground">{getInitials(selectedUser.full_name)}</span>
              </div>
            )}
            <div>
              <p className="font-semibold text-foreground">{selectedUser.full_name}</p>
              {selectedUser.username && <p className="text-sm text-muted-foreground">@{selectedUser.username}</p>}
            </div>
          </div>
        )}

        <div className="paypal-surface mt-8 rounded-3xl p-6">
          <div className="mb-8 text-center">
            <p className="text-5xl font-bold text-foreground">{currency.symbol}{amount || "0.00"}</p>
            <p className="text-sm text-muted-foreground mt-1">{currency.flag} {currency.code}</p>
            <p className="mt-2 text-sm font-medium text-paypal-blue">Available: {formatCurrency(balance)}</p>
          </div>
          <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="mb-4 h-14 rounded-2xl border-white/70 bg-white text-center text-2xl" min="0.01" step="0.01" />
          <Input placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
            className="mb-6 h-12 rounded-2xl border-white/70 bg-white" />
          <Button onClick={handleOpenSendConfirm} disabled={loading || !amount || parseFloat(amount) <= 0}
            className="h-14 w-full rounded-full bg-paypal-blue text-lg font-semibold text-white hover:bg-[#004dc5]">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending...
              </span>
            ) : (
              `Send ${currency.symbol}${amount || "0.00"}`
            )}
          </Button>
        </div>

        <TransactionReceipt open={receiptOpen} onOpenChange={(open) => {
          setReceiptOpen(open);
          if (!open) navigate("/dashboard");
        }} receipt={receiptData} />

        <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
          <DialogContent className="rounded-3xl">
            <DialogTitle className="text-xl font-bold text-foreground">Confirm payment</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Review the details before sending.
            </DialogDescription>
            {selectedUser && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 px-3 py-2.5">
                {selectedUser.avatar_url ? (
                  <img src={selectedUser.avatar_url} alt={selectedUser.full_name} className="h-12 w-12 rounded-full border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paypal-dark">
                    <span className="text-sm font-bold text-primary-foreground">{getInitials(selectedUser.full_name)}</span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">{selectedUser.full_name}</p>
                  {selectedUser.username && <p className="text-sm text-muted-foreground">@{selectedUser.username}</p>}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2 rounded-2xl border border-border p-3 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">{currency.symbol}{Number(amount || 0).toFixed(2)} ({currency.code})</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Converted (USD)</span>
                <span className="font-semibold text-foreground">${(Number(amount || 0) / (currency.rate || 1)).toFixed(2)}</span>
              </p>
              {note.trim() && (
                <p className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">Note</span>
                  <span className="max-w-[70%] break-all text-right text-foreground">{formatShortText(note.trim())}</span>
                </p>
              )}
            </div>

            <p className="mt-3 rounded-md border border-paypal-light-blue/60 bg-[#edf3ff] px-2 py-1 text-xs text-paypal-blue">
              Only transact with users you know. Approve only if you expected this transaction. If you do not recognize the user, cancel now.
            </p>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="h-11 flex-1 rounded-2xl" onClick={() => setShowSendConfirm(false)}>
                Cancel
              </Button>
              <Button
                className="h-11 flex-1 rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
                disabled={loading}
                onClick={async () => {
                  setShowSendConfirm(false);
                  await handleSend();
                }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "Confirm & Send"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 pt-4">
      <div className="flex items-center gap-3">
        {myAvatarUrl ? (
          <img
            src={myAvatarUrl}
            alt={myFullName || "Profile"}
            className="h-10 w-10 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paypal-dark">
            <span className="text-xs font-bold text-primary-foreground">{getInitials(myFullName || "OpenPay User")}</span>
          </div>
        )}
        <button onClick={() => navigate("/dashboard")}><ArrowLeft className="w-6 h-6 text-foreground" /></button>
        <div className="flex-1">
          <Input placeholder="Name, username, email, or account number" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 rounded-full border border-white/70 bg-white pl-4" autoFocus />
        </div>
        <button
          onClick={() => navigate("/scan-qr?returnTo=/send")}
          className="paypal-surface flex h-12 items-center gap-2 rounded-full px-3"
          aria-label="Scan QR code"
        >
          <ScanLine className="h-5 w-5 text-foreground" />
          <span className="text-sm font-medium text-foreground">Scan QR</span>
        </button>
      </div>

      <div className="mt-6">
        {!searchQuery && recentRecipients.length > 0 && (
          <>
            <h2 className="mb-3 font-bold text-foreground">Recent</h2>
            <div className="paypal-surface overflow-hidden rounded-2xl mb-5">
              {recentRecipients.map((user, i) => (
                <div
                  key={`${user.id}-${user.last_sent_at}`}
                  onClick={() => handleSelectUser(user)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-3 text-left last:border-b-0 hover:bg-secondary/50 transition cursor-pointer"
                >
                  {renderAvatar(user, i)}
                  <div className="text-left flex-1">
                    <p className="font-semibold text-foreground">{user.full_name}</p>
                    {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
                    <p className="text-xs text-muted-foreground">Recent transaction</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleBookmark(user);
                    }}
                    className="rounded-full p-2 hover:bg-secondary"
                    aria-label={contactIds.includes(user.id) ? "Remove bookmark" : "Save bookmark"}
                  >
                    {contactIds.includes(user.id) ? <BookmarkCheck className="h-5 w-5 text-paypal-blue" /> : <Bookmark className="h-5 w-5 text-muted-foreground" />}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mb-4 font-bold text-foreground">{searchQuery ? "Search results" : "Your contacts"}</h2>
        <div className="paypal-surface overflow-hidden rounded-2xl">
          {isAccountNumberSearch && (
            <>
              {accountLookupLoading && (
                <p className="border-b border-border/70 px-3 py-3 text-sm text-muted-foreground">Searching account number...</p>
              )}
              {!accountLookupLoading && accountLookupResult && (
                <div
                  onClick={() => handleSelectUser(accountLookupResult)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-3 text-left hover:bg-secondary/50 transition cursor-pointer"
                >
                  {renderAvatar(accountLookupResult, 0)}
                  <div className="text-left flex-1">
                    <p className="font-semibold text-foreground">{accountLookupResult.full_name}</p>
                    {accountLookupResult.username && <p className="text-sm text-muted-foreground">@{accountLookupResult.username}</p>}
                    <p className="text-xs text-muted-foreground">Matched by account number</p>
                  </div>
                  <Info className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </>
          )}
          {filteredWithoutAccountMatch.map((user, i) => (
            <div
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-3 text-left last:border-b-0 hover:bg-secondary/50 transition cursor-pointer"
            >
              {renderAvatar(user, i)}
              <div className="text-left flex-1">
                <p className="font-semibold text-foreground">{user.full_name}</p>
                {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleBookmark(user);
                }}
                className="rounded-full p-2 hover:bg-secondary"
                aria-label={contactIds.includes(user.id) ? "Remove bookmark" : "Save bookmark"}
              >
                {contactIds.includes(user.id) ? <BookmarkCheck className="h-5 w-5 text-paypal-blue" /> : <Bookmark className="h-5 w-5 text-muted-foreground" />}
              </button>
              <Info className="w-5 h-5 text-muted-foreground" />
            </div>
          ))}
          {filteredWithoutAccountMatch.length === 0 && !accountLookupResult && !accountLookupLoading && (
            <p className="text-center text-muted-foreground py-8">No users found</p>
          )}
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="rounded-3xl">
          <DialogTitle className="sr-only">Confirm recipient</DialogTitle>
          <DialogDescription className="sr-only">Confirm that the selected recipient is correct.</DialogDescription>
          {selectedUser && (
            <div>
              {selectedUser.avatar_url ? (
                <img
                  src={selectedUser.avatar_url}
                  alt={selectedUser.full_name}
                  className="mb-3 h-16 w-16 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-paypal-dark">
                  <span className="text-lg font-bold text-primary-foreground">{getInitials(selectedUser.full_name)}</span>
                </div>
              )}
              <h3 className="text-xl font-bold">{selectedUser.full_name}</h3>
              {selectedUser.username && <p className="text-muted-foreground">@{selectedUser.username}</p>}
              <p className="text-2xl font-bold mt-4 mb-2">Is this the right person?</p>
              <Button onClick={handleConfirmUser} className="mt-4 h-14 w-full rounded-full bg-paypal-blue text-lg font-semibold text-white hover:bg-[#004dc5]">Continue</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default SendMoney;
