import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/contexts/CurrencyContext";

const CurrencyConverterPage = () => {
  const navigate = useNavigate();
  const { currencies, ratesUpdatedAt } = useCurrency();
  const [amount, setAmount] = useState("1");
  const [fromCode, setFromCode] = useState("USD");
  const [toCode, setToCode] = useState("PHP");

  const byCode = useMemo(
    () => new Map(currencies.map((currency) => [currency.code, currency])),
    [currencies],
  );

  const fromCurrency = byCode.get(fromCode) ?? currencies[0];
  const toCurrency = byCode.get(toCode) ?? currencies[0];

  const parsedAmount = Number(amount);
  const safeAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
  const usdAmount = fromCurrency?.rate ? safeAmount / fromCurrency.rate : 0;
  const converted = usdAmount * (toCurrency?.rate ?? 1);
  const unitRate = fromCurrency?.rate ? (toCurrency?.rate ?? 1) / fromCurrency.rate : 0;
  const formattedUpdatedAt = ratesUpdatedAt
    ? new Date(ratesUpdatedAt).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not synced yet";

  const swapCurrencies = () => {
    setFromCode(toCode);
    setToCode(fromCode);
  };
  const getPiCodeLabel = (code: string) => (code === "PI" ? "PI" : `PI ${code}`);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-4">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => navigate("/menu")}><ArrowLeft className="h-6 w-6 text-foreground" /></button>
          <h1 className="paypal-heading">Currency Converter</h1>
        </div>

        <div className="paypal-surface rounded-3xl p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mb-5 h-12 rounded-2xl bg-white text-lg"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</p>
              <select
                value={fromCode}
                onChange={(event) => setFromCode(event.target.value)}
                className="h-12 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.flag} {getPiCodeLabel(currency.code)} - {currency.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="button" variant="outline" onClick={swapCurrencies} className="h-12 rounded-2xl px-4">
              <ArrowUpDown className="h-4 w-4" />
            </Button>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</p>
              <select
                value={toCode}
                onChange={(event) => setToCode(event.target.value)}
                className="h-12 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.flag} {getPiCodeLabel(currency.code)} - {currency.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-secondary/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Converted</p>
            <p className="mt-1 text-3xl font-bold text-foreground">
              {toCurrency?.symbol}{converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              1 {fromCurrency?.code} = {unitRate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} {toCurrency?.code}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Live rates are USD-based and PI is fixed at 1 PI = 1 USD.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last updated: {formattedUpdatedAt}
            </p>
          </div>
        </div>
      </div>

      <BottomNav active="menu" />
    </div>
  );
};

export default CurrencyConverterPage;
