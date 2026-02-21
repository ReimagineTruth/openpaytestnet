import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SplashScreen from "@/components/SplashScreen";

const Index = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.auth.getSession(),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]).then(([{ data: { session } }]) => {
      if (session) {
        navigate("/dashboard");
      } else {
        navigate("/auth");
      }
      setChecking(false);
    });
  }, [navigate]);

  if (checking) {
    return <SplashScreen />;
  }

  return null;
};

export default Index;
