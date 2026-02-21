export type AppLanguageOption = {
  code: string;
  label: string;
};

export const APP_LANGUAGE_STORAGE_KEY = "openpay_app_language";

export const APP_LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "ur", label: "Urdu" },
  { code: "fa", label: "Persian" },
  { code: "sw", label: "Swahili" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "fil", label: "Filipino" },
];

const setGoogleTranslateCookie = (languageCode: string) => {
  if (typeof document === "undefined") return;
  const safeLanguage = languageCode || "en";
  document.cookie = `googtrans=/auto/${safeLanguage}; path=/; SameSite=Lax`;
};

export const getStoredAppLanguage = () => {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || "en";
};

export const applyStoredAppLanguage = (languageCode: string) => {
  if (typeof window === "undefined") return;
  const safeLanguage = languageCode || "en";
  localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, safeLanguage);
  setGoogleTranslateCookie(safeLanguage);
  document.documentElement.lang = safeLanguage;
};

