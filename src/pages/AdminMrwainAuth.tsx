import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";

const AdminMrwainAuth = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");

  const setMode = (nextMode: "signin" | "signup") => {
    setParams({ mode: nextMode });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("No internet connection. Please reconnect and try again.");
      return;
    }

    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) toast.error(error.message);
      else navigate("/dashboard");
      return;
    }

    if (password.length < 6) {
      setLoading(false);
      toast.error("Password must be at least 6 characters");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, username },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Account created");
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-paypal-blue to-[#072a7a] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm flex-col justify-center">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-4 h-16 w-16" />
          <p className="mb-1 text-lg font-semibold text-white">OpenPay</p>
        </div>

        <div className="paypal-surface w-full rounded-3xl p-7 shadow-2xl shadow-black/15">
          <Button asChild variant="outline" className="mb-4 h-10 w-full rounded-2xl">
            <Link to="/auth">Back to Pi Authentication</Link>
          </Button>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
            <button
              onClick={() => setMode("signin")}
              className={`rounded-xl py-2 text-sm font-semibold ${mode === "signin" ? "bg-white text-paypal-blue" : "text-muted-foreground"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`rounded-xl py-2 text-sm font-semibold ${mode === "signup" ? "bg-white text-paypal-blue" : "text-muted-foreground"}`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <Input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-12 rounded-2xl border-white/70 bg-white"
                />
                <Input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-12 rounded-2xl border-white/70 bg-white"
                />
              </>
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-2xl border-white/70 bg-white"
            />
            <Input
              type="password"
              placeholder={mode === "signin" ? "Password" : "Password (min 6 characters)"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-2xl border-white/70 bg-white"
            />
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl bg-paypal-blue text-white hover:bg-[#004dc5]">
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="h-12 w-full rounded-2xl"
            >
              <a href="https://openpaylandingpage.vercel.app/" target="_blank" rel="noreferrer">
                Landing Page
              </a>
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing, you agree to our <Link to="/terms" className="text-paypal-blue font-medium">Terms</Link> and{" "}
            <Link to="/privacy" className="text-paypal-blue font-medium">Privacy Policy</Link>.
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Learn more: <Link to="/about-openpay" className="text-paypal-blue font-medium">About OpenPay</Link> -{" "}
            <Link to="/legal" className="text-paypal-blue font-medium">Legal</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminMrwainAuth;
