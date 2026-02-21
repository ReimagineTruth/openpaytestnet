import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AppSecuritySettings,
  hashSecret,
  loadAppSecuritySettings,
  saveAppSecuritySettings,
  verifyBiometricCredential,
} from "@/lib/appSecurity";

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

const HelpCenter = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<AppSecuritySettings>({});
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const forgotMode = searchParams.get("topic") === "forgot-mpin";

  const faqs = [
    {
      q: "Why did my payment fail?",
      a: "Most failures happen due to insufficient balance or an expired session. Sign in again and retry.",
    },
    {
      q: "How do I cancel a payment request?",
      a: "Open Request Money and reject pending incoming requests. Sent requests update when paid or rejected.",
    },
    {
      q: "How do I pay an invoice?",
      a: "Open Send Invoice, find the invoice in Received invoices, and tap Pay Invoice.",
    },
  ];

  const loadTickets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/signin");
      return;
    }
    setUserId(user.id);
    setEmail(user.email || "");
    setSecuritySettings(loadAppSecuritySettings(user.id));

    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, message, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setTickets(data || []);
  }, [navigate]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSubmitTicket = async () => {
    if (!userId) return;
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: userId,
      subject: subject.trim(),
      message: message.trim(),
      status: "open",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Ticket submitted");
    setSubject("");
    setMessage("");
    await loadTickets();
  };

  const persistSecuritySettings = (nextSettings: AppSecuritySettings) => {
    if (!userId) return;
    setSecuritySettings(nextSettings);
    saveAppSecuritySettings(userId, nextSettings);
  };

  const handleRemoveMpinByPassword = async () => {
    if (!securitySettings.pinHash || !securitySettings.passwordHash) return;
    if (!recoveryPassword.trim()) {
      setRecoveryError("Enter your security password.");
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError("");
    const hashed = await hashSecret(recoveryPassword);
    if (hashed !== securitySettings.passwordHash) {
      setRecoveryLoading(false);
      setRecoveryError("Security password is incorrect.");
      return;
    }
    const nextSettings = { ...securitySettings };
    delete nextSettings.pinHash;
    persistSecuritySettings(nextSettings);
    setRecoveryPassword("");
    setRecoveryLoading(false);
    toast.success("MPIN removed. Set a new MPIN in Settings.");
  };

  const handleRemoveMpinByBiometric = async () => {
    if (!securitySettings.pinHash || !securitySettings.biometricCredentialId) return;
    setRecoveryLoading(true);
    setRecoveryError("");
    try {
      await verifyBiometricCredential(securitySettings.biometricCredentialId);
      const nextSettings = { ...securitySettings };
      delete nextSettings.pinHash;
      persistSecuritySettings(nextSettings);
      toast.success("MPIN removed. Set a new MPIN in Settings.");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Biometric verification failed.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRemoveBiometricByPassword = async () => {
    if (!securitySettings.biometricCredentialId || !securitySettings.passwordHash) return;
    if (!recoveryPassword.trim()) {
      setRecoveryError("Enter your security password.");
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError("");
    const hashed = await hashSecret(recoveryPassword);
    if (hashed !== securitySettings.passwordHash) {
      setRecoveryLoading(false);
      setRecoveryError("Security password is incorrect.");
      return;
    }
    const nextSettings = { ...securitySettings, biometricEnabled: false };
    delete nextSettings.biometricCredentialId;
    persistSecuritySettings(nextSettings);
    setRecoveryPassword("");
    setRecoveryLoading(false);
    toast.success("Biometric lock removed for this device.");
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center gap-3 px-4 pt-4 mb-4">
        <button onClick={() => navigate("/menu")}>
          <ArrowLeft className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Help Center</h1>
      </div>

      <div className="px-4 space-y-4">
        <div className={`bg-card rounded-2xl border border-border p-4 space-y-3 ${forgotMode ? "ring-2 ring-paypal-blue/30" : ""}`}>
          <h2 className="font-semibold text-foreground">Forgot MPIN / Biometric Recovery</h2>
          <p className="text-sm text-muted-foreground">
            Bound recovery email: <span className="font-semibold text-foreground">{email || "No email"}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            If all local security methods fail, use this email to sign in again and reset security from Settings.
          </p>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium text-foreground">Verify with security password</p>
            <Input
              type="password"
              placeholder="Enter security password"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={handleRemoveMpinByPassword}
                disabled={recoveryLoading || !securitySettings.pinHash || !securitySettings.passwordHash}
              >
                Remove MPIN
              </Button>
              <Button
                variant="outline"
                onClick={handleRemoveBiometricByPassword}
                disabled={recoveryLoading || !securitySettings.biometricCredentialId || !securitySettings.passwordHash}
              >
                Remove Biometric
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleRemoveMpinByBiometric}
            disabled={recoveryLoading || !securitySettings.pinHash || !securitySettings.biometricCredentialId}
            className="w-full"
          >
            Use Biometric to Remove MPIN
          </Button>

          {recoveryError && <p className="text-sm text-destructive">{recoveryError}</p>}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">FAQs</h2>
          {faqs.map((faq) => (
            <div key={faq.q} className="border border-border rounded-xl p-3">
              <p className="font-medium text-foreground">{faq.q}</p>
              <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
            </div>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">Contact support</h2>
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Describe your issue"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button onClick={handleSubmitTicket} disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Submit Ticket"}
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-semibold text-foreground">My tickets</h2>
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet</p>}
          {tickets.map((ticket) => (
            <div key={ticket.id} className="border border-border rounded-xl p-3">
              <p className="font-medium text-foreground">{ticket.subject}</p>
              <p className="text-sm text-muted-foreground mt-1">{ticket.message}</p>
              <p className="text-sm text-muted-foreground mt-2">{format(new Date(ticket.created_at), "MMM d, yyyy")}</p>
              <p className="text-sm mt-1 capitalize">Status: {ticket.status.replace("_", " ")}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
