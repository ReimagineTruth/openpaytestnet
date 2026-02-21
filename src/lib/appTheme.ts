export type AppThemeMode = "light" | "dark";

export const APP_THEME_STORAGE_KEY = "openpay_app_theme";

const isThemeMode = (value: string | null): value is AppThemeMode => value === "light" || value === "dark";

export const getStoredAppTheme = (): AppThemeMode => {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(APP_THEME_STORAGE_KEY);
  if (isThemeMode(saved)) return saved;
  return "light";
};

export const applyAppTheme = (theme: AppThemeMode) => {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
};

export const persistAndApplyAppTheme = (theme: AppThemeMode) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  }
  applyAppTheme(theme);
};

