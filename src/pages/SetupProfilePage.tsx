import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SetupProfilePage = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single();

      const loadedName = (profile?.full_name || "").trim();
      const loadedUsername = (profile?.username || "").trim();

      setFullName(loadedName);
      setUsername(loadedUsername.startsWith("pi_") ? "" : loadedUsername);
    };

    load();
  }, [navigate]);

  const normalizedUsername = useMemo(() => {
    return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  }, [username]);

  const handleSave = async () => {
    if (!userId) return;

    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/i.test(normalizedUsername)) {
      toast.error("Username must be 3-20 characters and use letters, numbers, or underscore");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        username: normalizedUsername,
      })
      .eq("id", userId);
    setSaving(false);

    if (error) {
      toast.error(error.message || "Failed to save profile");
      return;
    }

    toast.success("Profile setup complete");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-4 pt-8 pb-10">
      <div className="mx-auto max-w-md">
        <h1 className="paypal-heading">Set up your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete your name and username to start using OpenPay.
        </p>

        <div className="paypal-surface mt-5 rounded-3xl p-5">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Full Name</p>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="h-12 rounded-2xl bg-white"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Username</p>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="h-12 rounded-2xl bg-white"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use 3-20 letters, numbers, or underscore.
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 h-12 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]"
          >
            {saving ? "Saving..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SetupProfilePage;
