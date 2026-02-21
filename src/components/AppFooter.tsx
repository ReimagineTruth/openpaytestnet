import { useLocation } from "react-router-dom";

const AppFooter = () => {
  const location = useLocation();
  if (location.pathname.startsWith("/scan-qr")) return null;

  return (
    <footer className="px-4 pb-4 pt-2 text-center text-xs text-muted-foreground">
      Copyright © 2026 OpenPay by Mrwain Organization. All rights reserved.
    </footer>
  );
};

export default AppFooter;
