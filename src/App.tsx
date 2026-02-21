import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import AdminMrwainAuth from "./pages/AdminMrwainAuth";
import Dashboard from "./pages/Dashboard";
import SendMoney from "./pages/SendMoney";
import QrScannerPage from "./pages/QrScannerPage";
import TopUp from "./pages/TopUp";
import ReceivePage from "./pages/ReceivePage";
import Contacts from "./pages/Contacts";
import MenuPage from "./pages/MenuPage";
import CurrencyConverterPage from "./pages/CurrencyConverterPage";
import ActivityPage from "./pages/ActivityPage";
import RequestMoney from "./pages/RequestMoney";
import DisputesPage from "./pages/DisputesPage";
import SendInvoice from "./pages/SendInvoice";
import HelpCenter from "./pages/HelpCenter";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import AffiliatePage from "./pages/AffiliatePage";
import OpenPayGuidePage from "./pages/OpenPayGuidePage";
import PublicLedgerPage from "./pages/PublicLedgerPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import AboutOpenPayPage from "./pages/AboutOpenPayPage";
import LegalPage from "./pages/LegalPage";
import OpenPayDocumentationPage from "./pages/OpenPayDocumentationPage";
import OpenPayApiDocsPage from "./pages/OpenPayApiDocsPage";
import OpenPartnerPage from "./pages/OpenPartnerPage";
import PiWhitepaperPage from "./pages/PiWhitepaperPage";
import PiMicaWhitepaperPage from "./pages/PiMicaWhitepaperPage";
import GdprPage from "./pages/GdprPage";
import PaymentLinksCreatePage from "./pages/PaymentLinksCreatePage";
import PiAuthPage from "./pages/PiAuthPage";
import SetupProfilePage from "./pages/SetupProfilePage";
import PiAdsPage from "./pages/PiAdsPage";
import AdminDashboard from "./pages/AdminDashboard";
import MerchantOnboardingPage from "./pages/MerchantOnboardingPage";
import OpenPayOfficialPage from "./pages/OpenPayOfficialPage";
import RemittanceMerchantPage from "./pages/RemittanceMerchantPage";
import MerchantPosPage from "./pages/MerchantPosPage";
import MerchantCheckoutPage from "./pages/MerchantCheckoutPage";
import OpenAppPage from "./pages/OpenAppPage";
import OpenPayDesktopPage from "./pages/OpenPayDesktopPage";
import VirtualCardPage from "./pages/VirtualCardPage";
import A2UPaymentsPage from "./pages/A2UPaymentsPage";
import NotFound from "./pages/NotFound";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { useRealtimePushNotifications } from "./hooks/useRealtimePushNotifications";
import AppSecurityGate from "./components/AppSecurityGate";
import AppFooter from "./components/AppFooter";
import BrandLogo from "./components/BrandLogo";
import AppLanguageTranslate from "./components/AppLanguageTranslate";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const location = useLocation();
  const routeLoaderReady = useRef(false);
  const [showRouteSplash, setShowRouteSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      routeLoaderReady.current = true;
      setShowRouteSplash(false);
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!routeLoaderReady.current) {
      return;
    }

    setShowRouteSplash(true);
    const timer = window.setTimeout(() => setShowRouteSplash(false), 500);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  const LegacyAdminMrwainRedirect = () => {
    const current = useLocation();
    return <Navigate to={`/sign-in${current.search || ""}`} replace />;
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<PiAuthPage />} />
        <Route path="/setup-profile" element={<SetupProfilePage />} />
        <Route path="/pi-ads" element={<PiAdsPage />} />
        <Route path="/sign-in" element={<AdminMrwainAuth />} />
        <Route path="/admin-mrwain" element={<LegacyAdminMrwainRedirect />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/signin" element={<Navigate to="/sign-in?mode=signin" replace />} />
        <Route path="/signup" element={<Navigate to="/sign-in?mode=signup" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/send" element={<SendMoney />} />
        <Route path="/scan-qr" element={<QrScannerPage />} />
        <Route path="/topup" element={<TopUp />} />
        <Route path="/receive" element={<ReceivePage />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/currency-converter" element={<CurrencyConverterPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/request-payment" element={<RequestMoney />} />
        <Route path="/send-invoice" element={<SendInvoice />} />
        <Route path="/disputes" element={<DisputesPage />} />
        <Route path="/help-center" element={<HelpCenter />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/affiliate" element={<AffiliatePage />} />
        <Route path="/ledger" element={<PublicLedgerPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/openpay-guide" element={<OpenPayGuidePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/about-openpay" element={<AboutOpenPayPage />} />
        <Route path="/openpay-documentation" element={<OpenPayDocumentationPage />} />
        <Route path="/openpay-api-docs" element={<OpenPayApiDocsPage />} />
        <Route path="/open-partner" element={<OpenPartnerPage />} />
        <Route path="/pi-whitepaper" element={<PiWhitepaperPage />} />
        <Route path="/pi-mica-whitepaper" element={<PiMicaWhitepaperPage />} />
        <Route path="/gdpr" element={<GdprPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/merchant-onboarding" element={<MerchantOnboardingPage />} />
        <Route path="/merchant-pos" element={<MerchantPosPage />} />
        <Route path="/payment-links/create" element={<PaymentLinksCreatePage />} />
        <Route path="/payment-link/:token" element={<MerchantCheckoutPage />} />
        <Route path="/merchant-checkout" element={<MerchantCheckoutPage />} />
        <Route path="/virtual-card" element={<VirtualCardPage />} />
        <Route path="/a2u-payments" element={<A2UPaymentsPage />} />
        <Route path="/remittance-merchant" element={<RemittanceMerchantPage />} />
        <Route path="/openpay-official" element={<OpenPayOfficialPage />} />
        <Route path="/openapp" element={<OpenAppPage />} />
        <Route path="/openpay-desktop" element={<OpenPayDesktopPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <AppSecurityGate />
      <AppFooter />

      {showRouteSplash && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gradient-to-b from-paypal-blue to-[#072a7a]">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-sm">
              <BrandLogo className="h-14 w-14" />
            </div>
            <p className="text-3xl font-bold tracking-tight text-white">OpenPay</p>
            <p className="mt-1 text-sm text-white/85">Loading page...</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-white/70">Powered by Pi Network</p>
            <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          </div>
        </div>
      )}
    </>
  );
};

const App = () => {
  useRealtimePushNotifications();

  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <TooltipProvider>
          <AppLanguageTranslate />
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
};

export default App;
