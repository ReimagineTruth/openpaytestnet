import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { upsertUserPreferences } from "@/lib/userPreferences";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/signin");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");
      setCreatedAt(user.created_at || null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", user.id)
        .single();

      setFullName(profile?.full_name || "");
      setUsername(profile?.username || "");
      setAvatarUrl(profile?.avatar_url || "");
    };

    load();
  }, [navigate]);

  const initials = fullName
    ? fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
    : "OP";

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;

    setUploadingAvatar(true);
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setUploadingAvatar(false);
      toast.error(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    setUploadingAvatar(false);
    if (profileError) {
      toast.error(profileError.message);
      return;
    }

    setAvatarUrl(publicUrl);
    upsertUserPreferences(userId, {
      profile_full_name: fullName.trim() || null,
      profile_username: username.trim() || null,
    }).catch(() => undefined);
    toast.success("Avatar updated");
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        username: username.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", userId);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    upsertUserPreferences(userId, {
      profile_full_name: fullName.trim(),
      profile_username: username.trim() || null,
    }).catch(() => undefined);
    toast.success("Profile updated");
  };

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate("/settings")} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Profile</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5">
        <div className="mb-5 flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile avatar" className="h-14 w-14 rounded-full object-cover border border-border" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paypal-blue text-lg font-bold text-white">
              {initials}
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{fullName || "OpenPay User"}</p>
            <p className="text-sm text-muted-foreground">{email || "No email"}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Full Name</p>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-2xl bg-white" />
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Username</p>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 rounded-2xl bg-white" />
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Profile Image</p>
            <Input type="file" accept="image/*" onChange={handleAvatarUpload} className="h-12 rounded-2xl bg-white" />
            {uploadingAvatar && <p className="mt-1 text-xs text-muted-foreground">Uploading image...</p>}
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Email</p>
            <Input value={email} disabled className="h-12 rounded-2xl bg-white/70" />
            <p className="mt-1 text-xs text-muted-foreground">
              This is your bound recovery email for MPIN and biometric recovery.
            </p>
          </div>
          <div className="rounded-2xl border border-paypal-light-blue/50 bg-paypal-light-blue/10 p-3 text-sm">
            <p className="font-semibold text-foreground">Security recovery</p>
            <p className="mt-1 text-muted-foreground">
              If you forget MPIN or device biometric access, open Help Center recovery tools.
            </p>
            <button
              type="button"
              onClick={() => navigate("/help-center?topic=forgot-mpin")}
              className="mt-2 text-sm font-semibold text-paypal-blue"
            >
              Open MPIN recovery
            </button>
          </div>
          {createdAt && (
            <p className="text-xs text-muted-foreground">
              Joined {format(new Date(createdAt), "MMM d, yyyy")}
            </p>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]">
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/terms" className="text-paypal-blue font-medium">Terms</Link>
        {" · "}
        <Link to="/privacy" className="text-paypal-blue font-medium">Privacy Policy</Link>
      </div>
    </div>
  );
};

export default ProfilePage;
