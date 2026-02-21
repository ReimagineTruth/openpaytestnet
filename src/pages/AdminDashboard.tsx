import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type AdminHistoryRow = {
  id: string;
  source_table: string;
  source_id: string;
  event_type: string;
  actor_user_id: string | null;
  related_user_id: string | null;
  amount: number | null;
  note: string;
  status: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
  actor_profile: { full_name: string; username: string } | null;
  related_profile: { full_name: string; username: string } | null;
};

type AdminSummary = {
  total_history_events: number;
  total_users: number;
  page_amount_sum: number;
  page_limit: number;
  page_offset: number;
};

type LoanApplicationRow = {
  id: string;
  user_id: string;
  requested_amount: number;
  requested_term_months: number;
  credit_score_snapshot: number;
  full_name: string;
  contact_number: string;
  address_line: string;
  city: string;
  country: string;
  openpay_account_number: string;
  openpay_account_username: string;
  agreement_accepted: boolean;
  status: string;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  applicant_display_name: string;
};

const PAGE_SIZE = 50;
const ADMIN_PROFILE_USERNAMES = new Set(["openpay", "wainfoundation"]);

const displayName = (profile: { full_name: string; username: string } | null, fallbackId: string) => {
  if (!profile) return fallbackId.slice(0, 8);
  if (profile.full_name) return profile.full_name;
  if (profile.username) return `@${profile.username}`;
  return fallbackId.slice(0, 8);
};

const displayNullableName = (
  profile: { full_name: string; username: string } | null,
  fallbackId: string | null,
) => {
  if (!fallbackId) return "-";
  return displayName(profile, fallbackId);
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [historyRows, setHistoryRows] = useState<AdminHistoryRow[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [offset, setOffset] = useState(0);
  const [viewerEmail, setViewerEmail] = useState<string>("");
  const [viewerUsername, setViewerUsername] = useState<string>("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loanApplications, setLoanApplications] = useState<LoanApplicationRow[]>([]);

  const hasPrev = offset > 0;
  const hasNext = useMemo(() => {
    if (!summary) return false;
    return offset + PAGE_SIZE < summary.total_history_events;
  }, [offset, summary]);

  const loadPage = async (nextOffset = offset) => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in first to open admin dashboard");
        navigate("/sign-in?mode=signin", { replace: true });
        return;
      }

      if (!user.email) {
        toast.error("Email sign-in required");
        navigate("/dashboard", { replace: true });
        return;
      }
      setViewerEmail(user.email);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();
        const normalizedUsername = (profile?.username || "").trim().toLowerCase();
        setViewerUsername(normalizedUsername);
        const normalizedEmailLocal = String(user.email || "").split("@")[0].trim().toLowerCase();
        if (!ADMIN_PROFILE_USERNAMES.has(normalizedUsername) && !ADMIN_PROFILE_USERNAMES.has(normalizedEmailLocal)) {
          toast.error("Admin access is restricted to @openpay and @wainfoundation");
          navigate("/dashboard", { replace: true });
          return;
        }
      } catch {
        setViewerUsername("");
        toast.error("Admin access check failed");
        navigate("/dashboard", { replace: true });
        return;
      }

      const { data, error } = await supabase.rpc("admin_dashboard_history" as any, {
        p_limit: PAGE_SIZE,
        p_offset: nextOffset,
      });
      if (error) {
        throw new Error(error.message || "Failed to load admin dashboard");
      }

      const payload = data as unknown as
        | {
            success?: boolean;
            error?: string;
            data?: { summary: AdminSummary; history: AdminHistoryRow[] };
          }
        | undefined;

      if (!payload?.success || !payload.data) {
        throw new Error(payload?.error || "Failed to load admin dashboard");
      }

      setHistoryRows(payload.data.history);
      setSummary(payload.data.summary);
      setOffset(nextOffset);

      const { data: loanApps, error: loanAppsError } = await (supabase as any).rpc("admin_list_loan_applications", {
        p_status: "pending",
        p_limit: 50,
        p_offset: 0,
      });
      if (loanAppsError) throw new Error(loanAppsError.message || "Failed to load loan applications");
      const normalizedLoanApps = Array.isArray(loanApps) ? loanApps : [];
      setLoanApplications(
        normalizedLoanApps.map((row: any) => ({
          id: String(row.id),
          user_id: String(row.user_id),
          requested_amount: Number(row.requested_amount || 0),
          requested_term_months: Number(row.requested_term_months || 0),
          credit_score_snapshot: Number(row.credit_score_snapshot || 620),
          full_name: String(row.full_name || ""),
          contact_number: String(row.contact_number || ""),
          address_line: String(row.address_line || ""),
          city: String(row.city || ""),
          country: String(row.country || ""),
          openpay_account_number: String(row.openpay_account_number || ""),
          openpay_account_username: String(row.openpay_account_username || ""),
          agreement_accepted: Boolean(row.agreement_accepted),
          status: String(row.status || "pending"),
          admin_note: String(row.admin_note || ""),
          reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
          created_at: String(row.created_at || ""),
          applicant_display_name: String(row.applicant_display_name || ""),
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSelfSendRow = (row: AdminHistoryRow) =>
    row.source_table === "transactions" &&
    row.event_type === "transaction_created" &&
    !!row.actor_user_id &&
    row.actor_user_id === row.related_user_id;
  const canViewAdminProfile = ADMIN_PROFILE_USERNAMES.has(viewerUsername);

  const handleSelfSendReview = async (row: AdminHistoryRow, decision: "approve" | "reject") => {
    setReviewingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dashboard", {
        body: {
          action: "review_self_send",
          transaction_id: row.source_id,
          decision,
          reason: `Admin review from dashboard for ledger event ${row.id}`,
        },
      });
      if (error) throw new Error(error.message || "Review failed");

      const refundedId = (data as { data?: { refunded_transaction_id?: string } })?.data?.refunded_transaction_id;
      if (decision === "approve" && refundedId) {
        toast.success(`Refund approved. Refund TX: ${refundedId}`);
      } else {
        toast.success(`Self-send ${decision}d.`);
      }
      await loadPage(offset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  };

  const handleLoanReview = async (applicationId: string, decision: "approve" | "reject") => {
    setReviewingId(applicationId);
    try {
      const { data, error } = await (supabase as any).rpc("admin_review_loan_application", {
        p_application_id: applicationId,
        p_decision: decision,
        p_admin_note: `Reviewed by @${viewerUsername || "admin"}`,
      });
      if (error) throw new Error(error.message || "Loan review failed");
      if (decision === "approve") {
        toast.success(`Loan approved${data ? ` | Loan ${String(data).slice(0, 8)}` : ""}`);
      } else {
        toast.success("Loan rejected");
      }
      await loadPage(offset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Loan review failed");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-4 pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} aria-label="Back">
              <ArrowLeft className="h-6 w-6 text-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-paypal-dark">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Transparent OpenPay transaction ledger</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => loadPage(offset)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {canViewAdminProfile && (
            <div className="paypal-surface rounded-2xl p-4 sm:col-span-3">
              <p className="text-xs text-muted-foreground">Admin Profile</p>
              <p className="mt-1 text-xl font-bold text-foreground">@{viewerUsername}</p>
              <p className="text-xs text-muted-foreground">Restricted visibility enabled for OpenPay core admins only.</p>
            </div>
          )}
          <div className="paypal-surface rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Total History Events</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.total_history_events ?? 0}</p>
          </div>
          <div className="paypal-surface rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Total Accounts</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.total_users ?? 0}</p>
          </div>
          <div className="paypal-surface rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Current Page Amount Sum</p>
            <p className="mt-1 text-2xl font-bold text-foreground">${(summary?.page_amount_sum ?? 0).toFixed(2)}</p>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <p>Signed in as {viewerEmail || "-"}</p>
          <p>
            Showing {summary ? offset + 1 : 0}-
            {summary ? Math.min(offset + PAGE_SIZE, summary.total_history_events) : 0}
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Related</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Record ID</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    No history events found.
                  </td>
                </tr>
              )}
              {historyRows.map((row) => (
                <tr key={row.id} className="border-t border-border/70 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{format(new Date(row.occurred_at), "MMM d, yyyy HH:mm")}</td>
                  <td className="px-4 py-3">{row.event_type}</td>
                  <td className="px-4 py-3">{row.source_table}</td>
                  <td className="px-4 py-3">{displayNullableName(row.actor_profile, row.actor_user_id)}</td>
                  <td className="px-4 py-3">{displayNullableName(row.related_profile, row.related_user_id)}</td>
                  <td className="px-4 py-3 font-semibold">{row.amount === null ? "-" : `$${Number(row.amount).toFixed(2)}`}</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                  <td className="px-4 py-3">{row.note || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                  <td className="px-4 py-3">
                    {isSelfSendRow(row) ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSelfSendReview(row, "approve")}
                          disabled={reviewingId === row.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelfSendReview(row, "reject")}
                          disabled={reviewingId === row.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-paypal-dark">Loan Applications (Pending)</h2>
            <p className="text-xs text-muted-foreground">{loanApplications.length} pending</p>
          </div>
          {loanApplications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending loan applications.</p>
          ) : (
            <div className="space-y-3">
              {loanApplications.map((app) => (
                <div key={app.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{app.applicant_display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(app.created_at), "MMM d, yyyy h:mm a")} | Score {app.credit_score_snapshot}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-paypal-blue">
                      ${app.requested_amount.toFixed(2)} / {app.requested_term_months}m
                    </p>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>Full name: {app.full_name}</p>
                    <p>Contact: {app.contact_number}</p>
                    <p className="sm:col-span-2">Address: {app.address_line}, {app.city}, {app.country}</p>
                    <p>Account number: {app.openpay_account_number}</p>
                    <p>Account username: @{app.openpay_account_username}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleLoanReview(app.id, "approve")}
                      disabled={reviewingId === app.id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoanReview(app.id, "reject")}
                      disabled={reviewingId === app.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={loading || !hasPrev}
            onClick={() => {
              const nextOffset = Math.max(0, offset - PAGE_SIZE);
              loadPage(nextOffset);
            }}
          >
            Previous
          </Button>
          <Button
            disabled={loading || !hasNext}
            onClick={() => {
              const nextOffset = offset + PAGE_SIZE;
              loadPage(nextOffset);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
