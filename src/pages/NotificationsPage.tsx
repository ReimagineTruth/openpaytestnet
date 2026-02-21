import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/signin");
        return;
      }

      const [transactionsRes, requestsRes, invoicesRes, ticketsRes, merchantNotifRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, sender_id, receiver_id, amount, created_at")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("payment_requests")
          .select("id, requester_id, payer_id, amount, status, created_at")
          .or(`requester_id.eq.${user.id},payer_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("invoices")
          .select("id, sender_id, recipient_id, amount, status, created_at")
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("support_tickets")
          .select("id, subject, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("app_notifications")
          .select("id, type, title, body, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const notifications: NotificationItem[] = [];

      (transactionsRes.data || []).forEach((tx) => {
        const incoming = tx.receiver_id === user.id;
        notifications.push({
          id: `tx-${tx.id}`,
          title: incoming ? "Payment received" : "Payment sent",
          description: `$${Number(tx.amount).toFixed(2)}`,
          createdAt: tx.created_at,
        });
      });

      (requestsRes.data || []).forEach((request) => {
        const incoming = request.payer_id === user.id;
        notifications.push({
          id: `request-${request.id}`,
          title: incoming ? "Money request received" : "Money request sent",
          description: `${request.status} · $${Number(request.amount).toFixed(2)}`,
          createdAt: request.created_at,
        });
      });

      (invoicesRes.data || []).forEach((invoice) => {
        const incoming = invoice.recipient_id === user.id;
        notifications.push({
          id: `invoice-${invoice.id}`,
          title: incoming ? "Invoice received" : "Invoice sent",
          description: `${invoice.status} · $${Number(invoice.amount).toFixed(2)}`,
          createdAt: invoice.created_at,
        });
      });

      (ticketsRes.data || []).forEach((ticket) => {
        notifications.push({
          id: `ticket-${ticket.id}`,
          title: "Support ticket update",
          description: `${ticket.subject} · ${ticket.status.replace("_", " ")}`,
          createdAt: ticket.created_at,
        });
      });

      (merchantNotifRes.data || []).forEach((item) => {
        notifications.push({
          id: `app-${item.id}`,
          title: item.title || "Notification",
          description: item.body || String(item.type || "App event"),
          createdAt: item.created_at,
        });
      });

      notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(notifications.slice(0, 30));
      setLoading(false);
    };

    load();
  }, [navigate]);

  const empty = useMemo(() => !loading && items.length === 0, [items.length, loading]);

  return (
    <div className="min-h-screen bg-background px-4 pt-4">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Notifications</h1>
      </div>

      <div className="paypal-surface overflow-hidden rounded-3xl">
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading notifications...</p>}
        {empty && (
          <div className="p-8 text-center">
            <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="border-b border-border/60 p-4 last:border-b-0">
            <p className="font-semibold text-foreground">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsPage;
