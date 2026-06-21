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

export function isTelegramMiniApp() {
  return Boolean(getTelegramInitData());
}

function setThemeVariables(webApp) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = webApp?.themeParams || {};

  root.style.setProperty("--tma-safe-top", `${webApp?.safeAreaInset?.top || 0}px`);
  root.style.setProperty("--tma-safe-bottom", `${webApp?.safeAreaInset?.bottom || 0}px`);
  root.style.setProperty("--tma-content-safe-bottom", `${webApp?.contentSafeAreaInset?.bottom || 0}px`);

  if (theme.bg_color) root.style.setProperty("--tg-app-bg", theme.bg_color);
  if (theme.secondary_bg_color) root.style.setProperty("--tg-app-secondary-bg", theme.secondary_bg_color);
  if (theme.text_color) root.style.setProperty("--tg-app-text", theme.text_color);
}

/**
 * Initializes Telegram Mini App UI without trusting initDataUnsafe for auth.
 * The backend still validates raw initData before creating an app session.
 */
export function setupTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) return () => {};

  try {
    webApp.ready?.();
    webApp.expand?.();
    webApp.setHeaderColor?.(TMA_HEADER);
    webApp.setBackgroundColor?.(TMA_BG);
    webApp.setBottomBarColor?.(TMA_BG);
  } catch {
    // Older Telegram clients may not support every method.
  }

  const syncTheme = () => setThemeVariables(webApp);
  syncTheme();

  try {
    webApp.onEvent?.("themeChanged", syncTheme);
    webApp.onEvent?.("safeAreaChanged", syncTheme);
    webApp.onEvent?.("contentSafeAreaChanged", syncTheme);
    webApp.onEvent?.("viewportChanged", syncTheme);
  } catch {
    // No-op on legacy clients.
  }

  return () => {
    try {
      webApp.offEvent?.("themeChanged", syncTheme);
      webApp.offEvent?.("safeAreaChanged", syncTheme);
      webApp.offEvent?.("contentSafeAreaChanged", syncTheme);
      webApp.offEvent?.("viewportChanged", syncTheme);
    } catch {
      // No-op.
    }
  };
}

export function hapticImpact(style = "light") {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    // Haptics are optional.
  }
}

export function hapticSelection() {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
  } catch {
    // Haptics are optional.
  }
}

export function hapticNotification(type = "success") {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    // Haptics are optional.
  }
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
  } catch {
    // Fallback below.
  }

  if (typeof window !== "undefined") window.open(safeUrl, "_blank", "noopener,noreferrer");
}

export function showTelegramAlert(message) {
  const text = String(message || "");
  const webApp = getTelegramWebApp();
  try {
    if (webApp?.showAlert) {
      webApp.showAlert(text);
      return;
    }
  } catch {
    // Fallback below.
  }
  if (typeof window !== "undefined") window.alert(text);
}
