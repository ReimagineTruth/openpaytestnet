import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  rate: number; // rate relative to USD
}

const baseCurrencies: Currency[] = [
  { code: "PI", symbol: "\u03C0", name: "Pi", flag: "PI", rate: 1 },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "\u{1F1FA}\u{1F1F8}", rate: 1 },
  { code: "EUR", symbol: "\u20AC", name: "Euro", flag: "\u{1F1EA}\u{1F1FA}", rate: 0.92 },
  { code: "GBP", symbol: "\u00A3", name: "British Pound", flag: "\u{1F1EC}\u{1F1E7}", rate: 0.79 },
  { code: "JPY", symbol: "\u00A5", name: "Japanese Yen", flag: "\u{1F1EF}\u{1F1F5}", rate: 149.5 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "\u{1F1E8}\u{1F1E6}", rate: 1.36 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "\u{1F1E6}\u{1F1FA}", rate: 1.53 },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", flag: "\u{1F1E8}\u{1F1ED}", rate: 0.88 },
  { code: "CNY", symbol: "\u00A5", name: "Chinese Yuan", flag: "\u{1F1E8}\u{1F1F3}", rate: 7.24 },
  { code: "INR", symbol: "\u20B9", name: "Indian Rupee", flag: "\u{1F1EE}\u{1F1F3}", rate: 83.1 },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", flag: "\u{1F1F2}\u{1F1FD}", rate: 17.15 },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", flag: "\u{1F1E7}\u{1F1F7}", rate: 4.97 },
  { code: "KRW", symbol: "\u20A9", name: "South Korean Won", flag: "\u{1F1F0}\u{1F1F7}", rate: 1325 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "\u{1F1F8}\u{1F1EC}", rate: 1.34 },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", flag: "\u{1F1ED}\u{1F1F0}", rate: 7.82 },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", flag: "\u{1F1F8}\u{1F1EA}", rate: 10.45 },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", flag: "\u{1F1F3}\u{1F1F4}", rate: 10.55 },
  { code: "DKK", symbol: "kr", name: "Danish Krone", flag: "\u{1F1E9}\u{1F1F0}", rate: 6.87 },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", flag: "\u{1F1F3}\u{1F1FF}", rate: 1.63 },
  { code: "ZAR", symbol: "R", name: "South African Rand", flag: "\u{1F1FF}\u{1F1E6}", rate: 18.6 },
  { code: "TRY", symbol: "\u20BA", name: "Turkish Lira", flag: "\u{1F1F9}\u{1F1F7}", rate: 30.2 },
  { code: "AED", symbol: "\u062F.\u0625", name: "UAE Dirham", flag: "\u{1F1E6}\u{1F1EA}", rate: 3.67 },
  { code: "SAR", symbol: "\uFDFC", name: "Saudi Riyal", flag: "\u{1F1F8}\u{1F1E6}", rate: 3.75 },
  { code: "PLN", symbol: "z\u0142", name: "Polish Zloty", flag: "\u{1F1F5}\u{1F1F1}", rate: 3.98 },
  { code: "THB", symbol: "\u0E3F", name: "Thai Baht", flag: "\u{1F1F9}\u{1F1ED}", rate: 35.2 },
  { code: "PHP", symbol: "\u20B1", name: "Philippine Peso", flag: "\u{1F1F5}\u{1F1ED}", rate: 55.8 },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", flag: "\u{1F1EE}\u{1F1E9}", rate: 15650 },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", flag: "\u{1F1F2}\u{1F1FE}", rate: 4.65 },
  { code: "CZK", symbol: "K\u010D", name: "Czech Koruna", flag: "\u{1F1E8}\u{1F1FF}", rate: 22.8 },
  { code: "CLP", symbol: "CL$", name: "Chilean Peso", flag: "\u{1F1E8}\u{1F1F1}", rate: 880 },
  { code: "NGN", symbol: "\u20A6", name: "Nigerian Naira", flag: "\u{1F1F3}\u{1F1EC}", rate: 1550 },
];

const additionalCurrencies: Currency[] = [
  { code: "ARS", symbol: "$", name: "Argentine Peso", flag: "\u{1F30E}", rate: 1 },
  { code: "COP", symbol: "$", name: "Colombian Peso", flag: "\u{1F30E}", rate: 1 },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol", flag: "\u{1F30E}", rate: 1 },
  { code: "BOB", symbol: "Bs", name: "Bolivian Boliviano", flag: "\u{1F30E}", rate: 1 },
  { code: "UYU", symbol: "$U", name: "Uruguayan Peso", flag: "\u{1F30E}", rate: 1 },
  { code: "PYG", symbol: "\u20B2", name: "Paraguayan Guarani", flag: "\u{1F30E}", rate: 1 },
  { code: "VES", symbol: "Bs.S", name: "Venezuelan Bolivar", flag: "\u{1F30E}", rate: 1 },
  { code: "GTQ", symbol: "Q", name: "Guatemalan Quetzal", flag: "\u{1F30E}", rate: 1 },
  { code: "HNL", symbol: "L", name: "Honduran Lempira", flag: "\u{1F30E}", rate: 1 },
  { code: "NIO", symbol: "C$", name: "Nicaraguan Cordoba", flag: "\u{1F30E}", rate: 1 },
  { code: "CRC", symbol: "\u20A1", name: "Costa Rican Colon", flag: "\u{1F30E}", rate: 1 },
  { code: "PAB", symbol: "B/.", name: "Panamanian Balboa", flag: "\u{1F30E}", rate: 1 },
  { code: "DOP", symbol: "RD$", name: "Dominican Peso", flag: "\u{1F30E}", rate: 1 },
  { code: "CUP", symbol: "$", name: "Cuban Peso", flag: "\u{1F30E}", rate: 1 },
  { code: "JMD", symbol: "J$", name: "Jamaican Dollar", flag: "\u{1F30E}", rate: 1 },
  { code: "TTD", symbol: "TT$", name: "Trinidad & Tobago Dollar", flag: "\u{1F30E}", rate: 1 },
  { code: "BBD", symbol: "Bds$", name: "Barbadian Dollar", flag: "\u{1F30E}", rate: 1 },
  { code: "BSD", symbol: "B$", name: "Bahamian Dollar", flag: "\u{1F30E}", rate: 1 },
  { code: "XCD", symbol: "EC$", name: "East Caribbean Dollar", flag: "\u{1F30E}", rate: 1 },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", flag: "\u{1F30D}", rate: 1 },
  { code: "RON", symbol: "lei", name: "Romanian Leu", flag: "\u{1F30D}", rate: 1 },
  { code: "BGN", symbol: "lv", name: "Bulgarian Lev", flag: "\u{1F30D}", rate: 1 },
  { code: "RSD", symbol: "din", name: "Serbian Dinar", flag: "\u{1F30D}", rate: 1 },
  { code: "MKD", symbol: "den", name: "Macedonian Denar", flag: "\u{1F30D}", rate: 1 },
  { code: "ALL", symbol: "L", name: "Albanian Lek", flag: "\u{1F30D}", rate: 1 },
  { code: "ISK", symbol: "kr", name: "Icelandic Krona", flag: "\u{1F30D}", rate: 1 },
  { code: "UAH", symbol: "\u20B4", name: "Ukrainian Hryvnia", flag: "\u{1F30D}", rate: 1 },
  { code: "BYN", symbol: "Br", name: "Belarusian Ruble", flag: "\u{1F30D}", rate: 1 },
  { code: "RUB", symbol: "\u20BD", name: "Russian Ruble", flag: "\u{1F30D}", rate: 1 },
  { code: "BAM", symbol: "KM", name: "Bosnia Convertible Mark", flag: "\u{1F30D}", rate: 1 },
  { code: "MDL", symbol: "L", name: "Moldovan Leu", flag: "\u{1F30D}", rate: 1 },
  { code: "PKR", symbol: "\u20A8", name: "Pakistani Rupee", flag: "\u{1F30F}", rate: 1 },
  { code: "BDT", symbol: "\u09F3", name: "Bangladeshi Taka", flag: "\u{1F30F}", rate: 1 },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee", flag: "\u{1F30F}", rate: 1 },
  { code: "NPR", symbol: "\u20A8", name: "Nepalese Rupee", flag: "\u{1F30F}", rate: 1 },
  { code: "VND", symbol: "\u20AB", name: "Vietnamese Dong", flag: "\u{1F30F}", rate: 1 },
  { code: "KHR", symbol: "\u17DB", name: "Cambodian Riel", flag: "\u{1F30F}", rate: 1 },
  { code: "LAK", symbol: "\u20AD", name: "Lao Kip", flag: "\u{1F30F}", rate: 1 },
  { code: "MMK", symbol: "K", name: "Myanmar Kyat", flag: "\u{1F30F}", rate: 1 },
  { code: "BND", symbol: "B$", name: "Brunei Dollar", flag: "\u{1F30F}", rate: 1 },
  { code: "MOP", symbol: "MOP$", name: "Macau Pataca", flag: "\u{1F30F}", rate: 1 },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar", flag: "\u{1F30F}", rate: 1 },
  { code: "MNT", symbol: "\u20AE", name: "Mongolian Tugrik", flag: "\u{1F30F}", rate: 1 },
  { code: "KZT", symbol: "\u20B8", name: "Kazakhstani Tenge", flag: "\u{1F30F}", rate: 1 },
  { code: "UZS", symbol: "so'm", name: "Uzbekistani Som", flag: "\u{1F30F}", rate: 1 },
  { code: "TJS", symbol: "SM", name: "Tajikistani Somoni", flag: "\u{1F30F}", rate: 1 },
  { code: "TMT", symbol: "m", name: "Turkmenistani Manat", flag: "\u{1F30F}", rate: 1 },
  { code: "KGS", symbol: "\u20C0", name: "Kyrgyzstani Som", flag: "\u{1F30F}", rate: 1 },
  { code: "IRR", symbol: "\uFDFC", name: "Iranian Rial", flag: "\u{1F30F}", rate: 1 },
  { code: "IQD", symbol: "\u0639.\u062F", name: "Iraqi Dinar", flag: "\u{1F30F}", rate: 1 },
  { code: "QAR", symbol: "\uFDFC", name: "Qatari Riyal", flag: "\u{1F30F}", rate: 1 },
  { code: "KWD", symbol: "\u062F.\u0643", name: "Kuwaiti Dinar", flag: "\u{1F30F}", rate: 1 },
  { code: "OMR", symbol: "\uFDFC", name: "Omani Rial", flag: "\u{1F30F}", rate: 1 },
  { code: "BHD", symbol: ".\u062F.\u0628", name: "Bahraini Dinar", flag: "\u{1F30F}", rate: 1 },
  { code: "ILS", symbol: "\u20AA", name: "Israeli Shekel", flag: "\u{1F30F}", rate: 1 },
  { code: "JOD", symbol: "\u062F.\u0627", name: "Jordanian Dinar", flag: "\u{1F30F}", rate: 1 },
  { code: "LBP", symbol: "L\u00A3", name: "Lebanese Pound", flag: "\u{1F30F}", rate: 1 },
  { code: "SYP", symbol: "S\u00A3", name: "Syrian Pound", flag: "\u{1F30F}", rate: 1 },
  { code: "YER", symbol: "\uFDFC", name: "Yemeni Rial", flag: "\u{1F30F}", rate: 1 },
  { code: "AFN", symbol: "\u060B", name: "Afghan Afghani", flag: "\u{1F30F}", rate: 1 },
  { code: "EGP", symbol: "\u00A3", name: "Egyptian Pound", flag: "\u{1F30D}", rate: 1 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", flag: "\u{1F30D}", rate: 1 },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling", flag: "\u{1F30D}", rate: 1 },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling", flag: "\u{1F30D}", rate: 1 },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr", flag: "\u{1F30D}", rate: 1 },
  { code: "GHS", symbol: "\u20B5", name: "Ghanaian Cedi", flag: "\u{1F30D}", rate: 1 },
  { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha", flag: "\u{1F30D}", rate: 1 },
  { code: "MWK", symbol: "MK", name: "Malawian Kwacha", flag: "\u{1F30D}", rate: 1 },
  { code: "MZN", symbol: "MT", name: "Mozambican Metical", flag: "\u{1F30D}", rate: 1 },
  { code: "BWP", symbol: "P", name: "Botswana Pula", flag: "\u{1F30D}", rate: 1 },
  { code: "NAD", symbol: "N$", name: "Namibian Dollar", flag: "\u{1F30D}", rate: 1 },
  { code: "SZL", symbol: "E", name: "Swazi Lilangeni", flag: "\u{1F30D}", rate: 1 },
  { code: "LSL", symbol: "L", name: "Lesotho Loti", flag: "\u{1F30D}", rate: 1 },
  { code: "AOA", symbol: "Kz", name: "Angolan Kwanza", flag: "\u{1F30D}", rate: 1 },
  { code: "CDF", symbol: "FC", name: "Congolese Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "RWF", symbol: "RF", name: "Rwandan Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "BIF", symbol: "FBu", name: "Burundian Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "DJF", symbol: "Fdj", name: "Djiboutian Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "SOS", symbol: "Sh", name: "Somali Shilling", flag: "\u{1F30D}", rate: 1 },
  { code: "SDG", symbol: "\u00A3", name: "Sudanese Pound", flag: "\u{1F30D}", rate: 1 },
  { code: "SSP", symbol: "\u00A3", name: "South Sudanese Pound", flag: "\u{1F30D}", rate: 1 },
  { code: "DZD", symbol: "\u062F\u062C", name: "Algerian Dinar", flag: "\u{1F30D}", rate: 1 },
  { code: "MAD", symbol: "\u062F.\u0645.", name: "Moroccan Dirham", flag: "\u{1F30D}", rate: 1 },
  { code: "TND", symbol: "\u062F.\u062A", name: "Tunisian Dinar", flag: "\u{1F30D}", rate: 1 },
  { code: "LYD", symbol: "LD", name: "Libyan Dinar", flag: "\u{1F30D}", rate: 1 },
  { code: "XOF", symbol: "CFA", name: "West African CFA Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "XAF", symbol: "FCFA", name: "Central African CFA Franc", flag: "\u{1F30D}", rate: 1 },
  { code: "MUR", symbol: "\u20A8", name: "Mauritian Rupee", flag: "\u{1F30D}", rate: 1 },
  { code: "SCR", symbol: "\u20A8", name: "Seychellois Rupee", flag: "\u{1F30D}", rate: 1 },
  { code: "PGK", symbol: "K", name: "Papua New Guinea Kina", flag: "\u{1F30F}", rate: 1 },
  { code: "FJD", symbol: "FJ$", name: "Fijian Dollar", flag: "\u{1F30F}", rate: 1 },
  { code: "SBD", symbol: "SI$", name: "Solomon Islands Dollar", flag: "\u{1F30F}", rate: 1 },
  { code: "VUV", symbol: "VT", name: "Vanuatu Vatu", flag: "\u{1F30F}", rate: 1 },
  { code: "WST", symbol: "WS$", name: "Samoan Tala", flag: "\u{1F30F}", rate: 1 },
  { code: "TOP", symbol: "T$", name: "Tongan Pa'anga", flag: "\u{1F30F}", rate: 1 },
];

const currencyFlagCountryCode: Record<string, string> = {
  USD: "US", CAD: "CA", MXN: "MX", BRL: "BR", ARS: "AR", CLP: "CL", COP: "CO", PEN: "PE", BOB: "BO", UYU: "UY",
  PYG: "PY", VES: "VE", GTQ: "GT", HNL: "HN", NIO: "NI", CRC: "CR", PAB: "PA", DOP: "DO", CUP: "CU", JMD: "JM",
  TTD: "TT", BBD: "BB", BSD: "BS", XCD: "AG",
  EUR: "EU", GBP: "GB", CHF: "CH", SEK: "SE", NOK: "NO", DKK: "DK", PLN: "PL", CZK: "CZ", HUF: "HU", RON: "RO",
  BGN: "BG", RSD: "RS", MKD: "MK", ALL: "AL", ISK: "IS", UAH: "UA", BYN: "BY", RUB: "RU", TRY: "TR", BAM: "BA",
  MDL: "MD",
  JPY: "JP", CNY: "CN", KRW: "KR", INR: "IN", PKR: "PK", BDT: "BD", LKR: "LK", NPR: "NP", IDR: "ID", MYR: "MY",
  THB: "TH", PHP: "PH", SGD: "SG", VND: "VN", KHR: "KH", LAK: "LA", MMK: "MM", BND: "BN", HKD: "HK", MOP: "MO",
  TWD: "TW", MNT: "MN", KZT: "KZ", UZS: "UZ", TJS: "TJ", TMT: "TM", KGS: "KG", IRR: "IR", IQD: "IQ", SAR: "SA",
  AED: "AE", QAR: "QA", KWD: "KW", OMR: "OM", BHD: "BH", ILS: "IL", JOD: "JO", LBP: "LB", SYP: "SY", YER: "YE",
  AFN: "AF",
  ZAR: "ZA", EGP: "EG", NGN: "NG", KES: "KE", TZS: "TZ", UGX: "UG", ETB: "ET", GHS: "GH", ZMW: "ZM", MWK: "MW",
  MZN: "MZ", BWP: "BW", NAD: "NA", SZL: "SZ", LSL: "LS", AOA: "AO", CDF: "CD", RWF: "RW", BIF: "BI", DJF: "DJ",
  SOS: "SO", SDG: "SD", SSP: "SS", DZD: "DZ", MAD: "MA", TND: "TN", LYD: "LY", XOF: "SN", XAF: "CM", MUR: "MU",
  SCR: "SC",
  AUD: "AU", NZD: "NZ", PGK: "PG", FJD: "FJ", SBD: "SB", VUV: "VU", WST: "WS", TOP: "TO",
};

const countryCodeToFlag = (countryCode: string) =>
  countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");

const isTwoLetterCountryCode = (value: string) => /^[A-Za-z]{2}$/.test(value);
const isGlobeEmoji = (value: string) => ["\u{1F30D}", "\u{1F30E}", "\u{1F30F}", "\u{1F310}"].includes(value);

const normalizeCurrencyFlag = (currencyCode: string, rawFlag?: string | null) => {
  if (currencyCode === "PI") return "PI";

  const candidate = String(rawFlag || "").trim();
  if (isTwoLetterCountryCode(candidate)) {
    return countryCodeToFlag(candidate.toUpperCase());
  }

  if (candidate && !isGlobeEmoji(candidate)) {
    return candidate;
  }

  const mappedCountryCode = currencyFlagCountryCode[currencyCode];
  if (mappedCountryCode) {
    return countryCodeToFlag(mappedCountryCode);
  }

  const inferredCountryCode = currencyCode.slice(0, 2);
  if (isTwoLetterCountryCode(inferredCountryCode)) {
    return countryCodeToFlag(inferredCountryCode);
  }

  return "\u{1F3F3}";
};

const existingCodes = new Set(baseCurrencies.map((currency) => currency.code));
const mergedCurrencies: Currency[] = [
  ...baseCurrencies,
  ...additionalCurrencies.filter((currency) => !existingCodes.has(currency.code)),
];
export const currencies: Currency[] = mergedCurrencies.map((currency) => {
  return { ...currency, flag: normalizeCurrencyFlag(currency.code, currency.flag) };
});

interface CurrencyContextType {
  currencies: Currency[];
  currency: Currency;
  ratesUpdatedAt: string | null;
  setCurrency: (c: Currency) => void;
  convert: (usdAmount: number) => number;
  format: (usdAmount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currencies,
  currency: currencies[0],
  ratesUpdatedAt: null,
  setCurrency: () => {},
  convert: (a) => a,
  format: (a) => `$${a.toFixed(2)}`,
});

export const useCurrency = () => useContext(CurrencyContext);

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(currencies);
  const [currency, setCurrencyState] = useState<Currency>(currencies[0]);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const LIVE_SYNC_KEY = "openpay_last_fx_sync_at";
    const LIVE_SYNC_MIN_INTERVAL_MS = 60_000;

    const shouldAttemptFxSync = () => {
      if (typeof window === "undefined") return false;
      const disabled = String(import.meta.env.VITE_DISABLE_FX_SYNC || "").toLowerCase() === "true";
      if (disabled) return false;
      const { hostname, protocol } = window.location;
      if (hostname === "localhost" || hostname === "127.0.0.1") return false;
      if (protocol !== "https:") return false;
      return true;
    };

    const maybeSyncLiveRates = async () => {
      try {
        if (!shouldAttemptFxSync()) return;
        const now = Date.now();
        const rawLast = typeof window !== "undefined" ? window.localStorage.getItem(LIVE_SYNC_KEY) : null;
        const last = rawLast ? Number(rawLast) : 0;
        if (Number.isFinite(last) && now - last < LIVE_SYNC_MIN_INTERVAL_MS) return;

        const { error } = await supabase.functions.invoke("fx-rates-sync");
        if (!error && typeof window !== "undefined") {
          window.localStorage.setItem(LIVE_SYNC_KEY, String(now));
        }
      } catch {
        // Keep conversion functional even if sync fails.
      }
    };

    const refreshRates = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      await maybeSyncLiveRates();

      const { data, error } = await supabase
        .from("supported_currencies")
        .select("iso_code, display_name, symbol, flag, usd_rate, is_active, updated_at")
        .eq("is_active", true);

      if (error || !data || !mounted) return;

      const dbRates = new Map(data.map((row) => [row.iso_code, Number(row.usd_rate || 1)]));

      const merged = currencies.map((fallback) => ({
        ...fallback,
        flag: normalizeCurrencyFlag(fallback.code, fallback.flag),
        rate: dbRates.get(fallback.code) ?? fallback.rate,
      }));
      const seen = new Set(merged.map((c) => c.code));
      const extras = data
        .filter((row) => !seen.has(row.iso_code))
        .map((row) => ({
          code: row.iso_code,
          name: row.display_name,
          symbol: row.symbol,
          flag: normalizeCurrencyFlag(row.iso_code, row.flag),
          rate: Number(row.usd_rate || 1),
        } satisfies Currency));
      const nextCurrencies = [...merged, ...extras];
      const latestUpdate = data
        .map((row) => row.updated_at)
        .filter((value): value is string => typeof value === "string")
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

      setAvailableCurrencies(nextCurrencies);
      setRatesUpdatedAt(latestUpdate);
      setCurrencyState((prev) => nextCurrencies.find((c) => c.code === prev.code) ?? nextCurrencies[0]);
    };

    refreshRates();
    const interval = window.setInterval(refreshRates, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const setCurrency = (nextCurrency: Currency) => {
    setCurrencyState(availableCurrencies.find((c) => c.code === nextCurrency.code) ?? nextCurrency);
  };

  const convert = (usdAmount: number) => usdAmount * currency.rate;

  const format = (usdAmount: number) => {
    const converted = convert(usdAmount);
    return `${currency.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const contextValue = useMemo(
    () => ({ currencies: availableCurrencies, currency, ratesUpdatedAt, setCurrency, convert, format }),
    [availableCurrencies, currency, ratesUpdatedAt],
  );

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
};


