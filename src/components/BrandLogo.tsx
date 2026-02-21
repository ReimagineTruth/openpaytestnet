import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
}

const BrandLogo = ({ className }: BrandLogoProps) => {
  return (
    <svg viewBox="0 0 100 100" className={cn("h-12 w-12", className)} role="img" aria-label="OpenPay logo">
      <circle cx="44" cy="50" r="21" fill="none" stroke="#8FC9FF" strokeWidth="13" />
      <circle cx="56" cy="50" r="21" fill="none" stroke="white" strokeWidth="13" />
    </svg>
  );
};

export default BrandLogo;
