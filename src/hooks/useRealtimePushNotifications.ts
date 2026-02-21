import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const showSystemNotification = async (title: string, body: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/notifications-sw.js");
      if (registration) {
        await registration.showNotification(title, {
          body,
          icon: "/openpay-o.svg",
          badge: "/openpay-o.svg",
          tag: "openpay-notification",
        });
        return;
      }
    }
  } catch {
    // Fall back to regular Notification below.
  }

  // Fallback when service worker is unavailable.
  new Notification(title, { body, icon: "/openpay-o.svg" });
};

export const useRealtimePushNotifications = () => {
  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const maybeNotify = async (title: string, body: string) => {
        if (document.visibilityState === "visible") {
          toast.info(`${title}: ${body}`);
        }
        await showSystemNotification(title, body);
      };

      const txChannel = supabase
        .channel(`tx-receiver-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "transactions",
            filter: `receiver_id=eq.${user.id}`,
          },
          async (payload) => {
            const tx = payload.new as { amount?: number; sender_id?: string; receiver_id?: string };
            const amount = Number(tx.amount || 0).toFixed(2);
            const isTopUp = tx.sender_id === tx.receiver_id && tx.receiver_id === user.id;
            if (isTopUp) {
              await maybeNotify("Top up successful", `$${amount} was added to your balance.`);
            } else {
              await maybeNotify("Payment received", `$${amount} was added to your balance.`);
            }
          },
        )
        .subscribe();

      const requestChannel = supabase
        .channel(`request-payer-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "payment_requests",
            filter: `payer_id=eq.${user.id}`,
          },
          async (payload) => {
            const amount = Number((payload.new as { amount?: number }).amount || 0).toFixed(2);
            await maybeNotify("Money request", `You received a request for $${amount}.`);
          },
        )
        .subscribe();

      const invoiceChannel = supabase
        .channel(`invoice-recipient-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "invoices",
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            const amount = Number((payload.new as { amount?: number }).amount || 0).toFixed(2);
            await maybeNotify("Invoice received", `New invoice for $${amount}.`);
          },
        )
        .subscribe();

      const supportChannel = supabase
        .channel(`support-user-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "support_tickets",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            const status = String((payload.new as { status?: string }).status || "updated").replace("_", " ");
            await maybeNotify("Support update", `Your ticket status is now ${status}.`);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(txChannel);
        supabase.removeChannel(requestChannel);
        supabase.removeChannel(invoiceChannel);
        supabase.removeChannel(supportChannel);
      };
    };

    let cleanup: (() => void) | undefined;
    bootstrap().then((fn) => {
      cleanup = fn;
    });

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, []);
};
