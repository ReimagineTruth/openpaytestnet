import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, QrCode, ScanLine } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getFunctionErrorMessage } from "@/lib/supabaseFunctionError";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { Info } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url?: string | null;
}

interface PaymentRequest {
  id: string;
  requester_id: string;
  payer_id: string;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
}

const RequestMoney = () => {
  const navigate = useNavigate();
  const { format: formatCurrency } = useCurrency();
  const [userId, setUserId] = useState<string | null>(null);
  const [selfProfile, setSelfProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [payerId, setPayerId] = useState("");
  const [selectedPayer, setSelectedPayer] = useState<Profile | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [scanError, setScanError] = useState("");
  const [accountLookupResult, setAccountLookupResult] = useState<Profile | null>(null);
  const [accountLookupLoading, setAccountLookupLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: "create"; payer: Profile; amount: number; note: string }
    | { type: "pay"; request: PaymentRequest; requester: Profile | null }
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

    const { data: selfProfileRow } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", user.id)
      .single();

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .neq("id", user.id);

    const { data: requestRows } = await supabase
      .from("payment_requests")
      .select("id, requester_id, payer_id, amount, note, status, created_at")
      .or(`requester_id.eq.${user.id},payer_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    setProfiles(profileRows || []);
    setSelfProfile(selfProfileRow || null);
    setRequests(requestRows || []);
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

  const incoming = requests.filter((r) => r.payer_id === userId);
  const outgoing = requests.filter((r) => r.requester_id === userId);
  const receiveQrValue = useMemo(() => {
    if (!userId) return "";
    const params = new URLSearchParams({
      uid: userId,
      name: selfProfile?.full_name || "",
      username: selfProfile?.username || "",
    });
    return `openpay://pay?${params.toString()}`;
  }, [selfProfile?.full_name, selfProfile?.username, userId]);

  const extractUserIdFromQr = (rawValue: string): string | null => {
    const value = rawValue.trim();
    if (!value) return null;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(value)) return value;

    try {
      const parsed = new URL(value);
      const uid = parsed.searchParams.get("uid") || parsed.searchParams.get("to");
      if (uid && uuidRegex.test(uid)) return uid;
    } catch {
      // no-op
    }

    const maybeUid = value.split("uid=")[1]?.split("&")[0];
    if (maybeUid && uuidRegex.test(maybeUid)) return maybeUid;

    return null;
  };

  useEffect(() => {
    if (!showScanner) return;

    let scanner: Html5Qrcode | null = null;
    let isDone = false;
    setScanError("");

    const waitForScannerElement = async () => {
      if (typeof document === "undefined") return false;
      for (let i = 0; i < 10; i += 1) {
        if (document.getElementById("openpay-receive-scanner")) return true;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return false;
    };

    const stopScanner = async () => {
      if (!scanner) return;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // no-op
      }
      try {
        scanner.clear();
      } catch {
        // no-op
      }
    };

    const patchVideoElementForMobile = () => {
      if (typeof document === "undefined") return;
      const video = document.querySelector("#openpay-receive-scanner video") as HTMLVideoElement | null;
      if (!video) return;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
    };

    const startScanner = async () => {
      const mounted = await waitForScannerElement();
      if (!mounted) {
        setScanError("Scanner failed to mount. Please try again.");
        return;
      }
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setScanError("Camera needs HTTPS (or localhost) to work.");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setScanError("Camera API is not available on this device/browser.");
        return;
      }

      scanner = new Html5Qrcode("openpay-receive-scanner", {
        useBarCodeDetectorIfSupported: false,
      });
      const onDecoded = async (decodedText: string) => {
        if (isDone) return;
        isDone = true;

        const scannedUserId = extractUserIdFromQr(decodedText);
        await stopScanner();
        setShowScanner(false);

        if (!scannedUserId) {
          toast.error("Invalid QR code");
          return;
        }
        if (scannedUserId === userId) {
          toast.error("You scanned your own QR code");
          return;
        }
        navigate(`/send?to=${scannedUserId}`);
      };

      const scanConfig = {
        fps: 12,
        disableFlip: false,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const box = Math.max(180, Math.floor(minEdge * 0.68));
          return { width: box, height: box };
        },
      };
      try {
        let cameras: Awaited<ReturnType<typeof Html5Qrcode.getCameras>> = [];
        try {
          cameras = await Html5Qrcode.getCameras();
        } catch {
          // Some browsers block camera enumeration until stream opens. Keep fallback sources.
        }
        const preferredBack = cameras.find((cam) =>
          /(back|rear|environment)/i.test(cam.label || ""),
        );

        const sources: Array<string | MediaTrackConstraints> = [];
        sources.push({ facingMode: { exact: "environment" } });
        sources.push({ facingMode: { ideal: "environment" } });
        sources.push({ facingMode: "environment" });
        if (preferredBack?.id) sources.push(preferredBack.id);
        if (cameras[0]?.id) sources.push(cameras[0].id);
        sources.push({ facingMode: "user" });

        let started = false;
        let startError = "";

        for (const source of sources) {
          try {
            await scanner.start(source, scanConfig, onDecoded, () => undefined);
            patchVideoElementForMobile();
            setScanError("");
            started = true;
            break;
          } catch (error) {
            startError = error instanceof Error ? error.message : "Unable to start camera";
          }
        }

        if (!started) {
          setScanError(startError || "Unable to start camera");
        }
      } catch (error) {
        setScanError(error instanceof Error ? error.message : "Unable to start camera");
      }
    };

    startScanner();

    return () => {
      isDone = true;
      stopScanner();
    };
  }, [navigate, showScanner, userId]);

  const submitCreate = async () => {
    if (!userId || !payerId) {
      toast.error("Select who you are requesting from");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("payment_requests").insert({
      requester_id: userId,
      payer_id: payerId,
      amount: parsedAmount,
      note: note.trim() || "",
      status: "pending",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Request sent");
    setAmount("");
    setNote("");
    setPayerId("");
    setSelectedPayer(null);
    await loadData();
  };

  const submitPay = async (request: PaymentRequest) => {
    setLoading(true);
    const { error } = await supabase.functions.invoke("send-money", {
      body: {
        receiver_id: request.requester_id,
        receiver_email: "__by_id__",
        amount: request.amount,
        note: request.note || "Payment request",
      },
    });

    if (error) {
      setLoading(false);
      toast.error(await getFunctionErrorMessage(error, "Payment failed"));
      return;
    }

    const { error: updateError } = await supabase
      .from("payment_requests")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", request.id);

    setLoading(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    toast.success("Request paid");
    await loadData();
  };

  const handleCreate = () => {
    if (!payerId || !selectedPayer) {
      toast.error("Select who you are requesting from");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setConfirmAction({
      type: "create",
      payer: selectedPayer,
      amount: parsedAmount,
      note: note.trim(),
    });
    setConfirmModalOpen(true);
  };

  const handlePay = (request: PaymentRequest) => {
    setConfirmAction({
      type: "pay",
      request,
      requester: profileMap.get(request.requester_id) || null,
    });
    setConfirmModalOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || loading) return;

    if (confirmAction.type === "create") {
      await submitCreate();
    } else {
      await submitPay(confirmAction.request);
    }

    setConfirmModalOpen(false);
    setConfirmAction(null);
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from("payment_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request rejected");
    await loadData();
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")}>
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Request Payment</h1>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={() => setShowInstructions(true)}>
          Instructions
        </Button>
      </div>

      <div className="px-4 space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Receive via QR</h2>
              <p className="text-sm text-muted-foreground">{selfProfile?.full_name || "Your account"}</p>
              {selfProfile?.username && <p className="text-sm text-muted-foreground">@{selfProfile.username}</p>}
            </div>
            <Button type="button" variant="outline" onClick={() => setShowScanner(true)}>
              <ScanLine className="mr-2 h-4 w-4" />
              Scan QR code
            </Button>
          </div>
          <div className="flex justify-center rounded-2xl border border-border bg-white p-4">
            {receiveQrValue ? (
              <QRCodeSVG
                value={receiveQrValue}
                size={180}
                level="H"
                includeMargin
                imageSettings={{
                  src: "/openpay-o.svg",
                  height: 30,
                  width: 30,
                  excavate: true,
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading QR code...</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Ask sender to scan this QR to open Express Send with your account.
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Create request</h2>
          <Input
            placeholder="Search person by name, username, email, or account number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted-foreground">
            {selectedPayer ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedPayer.avatar_url ? (
                    <img src={selectedPayer.avatar_url} alt={selectedPayer.full_name} className="h-8 w-8 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {selectedPayer.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedPayer.full_name}</p>
                    {selectedPayer.username && <p className="text-xs text-muted-foreground">@{selectedPayer.username}</p>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3"
                  onClick={() => { setSelectedPayer(null); setPayerId(""); }}
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
                      onClick={() => { setPayerId(accountLookupResult.id); setSelectedPayer(accountLookupResult); }}
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
                      onClick={() => { setPayerId(p.id); setSelectedPayer(p); }}
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
          <Textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={handleCreate} disabled={loading || !payerId} className="w-full">
            {loading ? "Sending..." : "Send Request"}
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Incoming requests</h2>
          {incoming.length === 0 && <p className="text-sm text-muted-foreground">No incoming requests</p>}
          {incoming.map((request) => {
            const requester = profileMap.get(request.requester_id);
            return (
              <div key={request.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {requester?.avatar_url ? (
                    <img src={requester.avatar_url} alt={requester.full_name} className="h-10 w-10 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {(requester?.full_name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground">{requester?.full_name || "Unknown user"}</p>
                    {requester?.username && <p className="text-sm text-muted-foreground">@{requester.username}</p>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{format(new Date(request.created_at), "MMM d, yyyy")}</p>
                <p className="font-semibold mt-1">{formatCurrency(request.amount)}</p>
                {request.note && <p className="text-sm text-muted-foreground mt-1">{request.note}</p>}
                <p className="text-sm mt-1 capitalize">Status: {request.status}</p>
                {request.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button className="flex-1" disabled={loading} onClick={() => handlePay(request)}>
                      Pay
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={loading}
                      onClick={() => handleReject(request.id)}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Sent requests</h2>
          {outgoing.length === 0 && <p className="text-sm text-muted-foreground">No requests sent yet</p>}
          {outgoing.map((request) => {
            const payer = profileMap.get(request.payer_id);
            return (
              <div key={request.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {payer?.avatar_url ? (
                    <img src={payer.avatar_url} alt={payer.full_name} className="h-10 w-10 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                      {(payer?.full_name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground">{payer?.full_name || "Unknown user"}</p>
                    {payer?.username && <p className="text-sm text-muted-foreground">@{payer.username}</p>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{format(new Date(request.created_at), "MMM d, yyyy")}</p>
                <p className="font-semibold mt-1">{formatCurrency(request.amount)}</p>
                {request.note && <p className="text-sm text-muted-foreground mt-1">{request.note}</p>}
                <p className="text-sm mt-1 capitalize">Status: {request.status}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="max-w-md rounded-3xl">
          <div className="mb-2 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-foreground" />
            <DialogTitle className="text-lg font-semibold text-foreground">Scan QR Code</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Point your camera at an OpenPay receive QR code.
          </DialogDescription>
          <div id="openpay-receive-scanner" className="min-h-[260px] overflow-hidden rounded-2xl border border-border" />
          {scanError && <p className="text-sm text-red-500">{scanError}</p>}
          <p className="text-xs text-muted-foreground">If camera does not open in Pi Browser, enable camera permission for this app and retry.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogTitle className="text-lg font-semibold text-foreground">Request Payment Instructions</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Review before sending or paying a request.
          </DialogDescription>
          <div className="space-y-2 text-sm text-foreground">
            <p>1. Confirm the name and username before you send a request.</p>
            <p>2. Verify the amount and note details carefully.</p>
            <p>3. Only pay requests from people you know and expected to transact with.</p>
            <p>4. If you do not recognize a request, reject or cancel it.</p>
          </div>
        </DialogContent>
      </Dialog>

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
            {confirmAction?.type === "create" ? "Confirm request" : "Confirm payment"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Review the details before sending.
          </DialogDescription>

          {(confirmAction?.type === "create" || confirmAction?.type === "pay") && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 px-3 py-2.5">
              {(confirmAction.type === "create" ? confirmAction.payer.avatar_url : confirmAction.requester?.avatar_url) ? (
                <img
                  src={confirmAction.type === "create" ? confirmAction.payer.avatar_url || "" : confirmAction.requester?.avatar_url || ""}
                  alt={confirmAction.type === "create" ? confirmAction.payer.full_name : confirmAction.requester?.full_name || "User"}
                  className="h-12 w-12 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paypal-dark">
                  <span className="text-sm font-bold text-primary-foreground">
                    {getInitials(confirmAction.type === "create" ? confirmAction.payer.full_name : confirmAction.requester?.full_name || "User")}
                  </span>
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {confirmAction.type === "create" ? confirmAction.payer.full_name : confirmAction.requester?.full_name || "Unknown user"}
                </p>
                {(confirmAction.type === "create" ? confirmAction.payer.username : confirmAction.requester?.username) && (
                  <p className="text-sm text-muted-foreground">
                    @{confirmAction.type === "create" ? confirmAction.payer.username : confirmAction.requester?.username}
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
                    ? formatCurrency(confirmAction.request.amount)
                    : "-"}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Converted (USD)</span>
              <span className="font-semibold text-foreground">
                ${confirmAction?.type === "create"
                  ? confirmAction.amount.toFixed(2)
                  : confirmAction?.type === "pay"
                    ? Number(confirmAction.request.amount || 0).toFixed(2)
                    : "0.00"}
              </span>
            </p>
            <p className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground">Note</span>
              <span className="max-w-[70%] break-all text-right text-foreground">
                {confirmAction?.type === "create"
                  ? confirmAction.note || "No note"
                  : confirmAction?.type === "pay"
                    ? confirmAction.request.note || "Payment request"
                    : "No note"}
              </span>
            </p>
          </div>

          <p className="mt-3 rounded-md border border-paypal-light-blue/60 bg-[#edf3ff] px-2 py-1 text-xs text-paypal-blue">
            Approve only if you know this user and expected this transaction. If you do not recognize the user or request, cancel now.
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
    </div>
  );
};

export default RequestMoney;
