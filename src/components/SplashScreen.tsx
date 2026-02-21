import BrandLogo from "@/components/BrandLogo";

interface SplashScreenProps {
  message?: string;
}

const SplashScreen = ({ message = "Loading your wallet..." }: SplashScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-paypal-blue to-[#072a7a] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-sm">
          <BrandLogo className="h-14 w-14" />
        </div>
        <p className="text-3xl font-bold tracking-tight text-white">OpenPay</p>
        <p className="mt-1 text-sm text-white/80">{message}</p>
        <p className="mt-1 text-xs font-medium tracking-normal text-white/65">Powered by Pi Network</p>
        <div className="mx-auto mt-5 h-8 w-8 rounded-full border-2 border-white/35 border-t-white animate-spin" />
      </div>
    </div>
  );
};

export default SplashScreen;
