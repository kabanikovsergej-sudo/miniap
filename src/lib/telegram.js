const TMA_BG = "#090a10";
const TMA_HEADER = "#090a10";

export function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData() {
  return String(getTelegramWebApp()?.initData || "");
}

export function getTelegramUser() {
  return getTelegramWebApp()?.initDataUnsafe?.user || null;
}

/**
 * FIX:
 * Не проверяем только initData.
 * На некоторых клиентах Telegram WebApp уже существует,
 * а initData приходит чуть позже.
 */
export function isTelegramMiniApp() {
  const webApp = getTelegramWebApp();

  if (webApp) return true;

  try {
    return navigator.userAgent.toLowerCase().includes("telegram");
  } catch {
    return false;
  }
}

function setThemeVariables(webApp) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const theme = webApp?.themeParams || {};

  root.style.setProperty("--tma-safe-top", `${webApp?.safeAreaInset?.top || 0}px`);
  root.style.setProperty("--tma-safe-bottom", `${webApp?.safeAreaInset?.bottom || 0}px`);
  root.style.setProperty(
    "--tma-content-safe-bottom",
    `${webApp?.contentSafeAreaInset?.bottom || 0}px`
  );

  if (theme.bg_color) root.style.setProperty("--tg-app-bg", theme.bg_color);
  if (theme.secondary_bg_color)
    root.style.setProperty("--tg-app-secondary-bg", theme.secondary_bg_color);
  if (theme.text_color)
    root.style.setProperty("--tg-app-text", theme.text_color);
}

export function setupTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) return () => {};

  try {
    webApp.ready?.();
    webApp.expand?.();
    webApp.setHeaderColor?.(TMA_HEADER);
    webApp.setBackgroundColor?.(TMA_BG);
    webApp.setBottomBarColor?.(TMA_BG);
  } catch {}

  const syncTheme = () => setThemeVariables(webApp);

  syncTheme();

  try {
    webApp.onEvent?.("themeChanged", syncTheme);
    webApp.onEvent?.("safeAreaChanged", syncTheme);
    webApp.onEvent?.("contentSafeAreaChanged", syncTheme);
    webApp.onEvent?.("viewportChanged", syncTheme);
  } catch {}

  return () => {
    try {
      webApp.offEvent?.("themeChanged", syncTheme);
      webApp.offEvent?.("safeAreaChanged", syncTheme);
      webApp.offEvent?.("contentSafeAreaChanged", syncTheme);
      webApp.offEvent?.("viewportChanged", syncTheme);
    } catch {}
  };
}

export function hapticImpact(style = "light") {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch {}
}

export function hapticSelection() {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
  } catch {}
}

export function hapticNotification(type = "success") {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {}
}

export function openTelegramLink(url) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return;

  const webApp = getTelegramWebApp();

  try {
    if (safeUrl.startsWith("https://t.me/") || safeUrl.startsWith("tg://")) {
      webApp?.openTelegramLink?.(safeUrl);
      return;
    }

    webApp?.openLink?.(safeUrl);
    return;
  } catch {}

  if (typeof window !== "undefined") {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }
}

export function showTelegramAlert(message) {
  const text = String(message || "");
  const webApp = getTelegramWebApp();

  try {
    if (webApp?.showAlert) {
      webApp.showAlert(text);
      return;
    }
  } catch {}

  if (typeof window !== "undefined") {
    window.alert(text);
  }
}