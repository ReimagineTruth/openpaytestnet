import { useNavigate } from "react-router-dom";
import { Home, QrCode, Menu } from "lucide-react";

interface BottomNavProps {
  active: "home" | "contacts" | "scan" | "menu";
}

const BottomNav = ({ active }: BottomNavProps) => {
  const navigate = useNavigate();

  const items = [
    { key: "home" as const, label: "Home", icon: Home, path: "/dashboard" },
    { key: "scan" as const, label: "Scan QR", icon: QrCode, path: "/scan-qr?returnTo=/send" },
    { key: "menu" as const, label: "Menu", icon: Menu, path: "/menu" },
  ];

  return (
    <div className="fixed bottom-3 left-0 right-0 z-30 px-4">
      <div className="mx-auto max-w-md paypal-surface rounded-2xl">
        <div className="flex items-center justify-around py-2">
        {items.map(({ key, label, icon: Icon, path }) => (
          <button
            key={key}
            onClick={() => navigate(path)}
            className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 transition ${
              active === key ? "bg-secondary text-paypal-blue" : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className={`text-xs ${active === key ? "font-bold" : "font-medium"}`}>{label}</span>
          </button>
        ))}
        </div>
      </div>
    </div>
  );
};

export default BottomNav;
