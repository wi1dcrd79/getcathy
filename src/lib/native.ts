/**
 * Native (Capacitor) runtime bootstrap.
 * Safe no-op on the web: every plugin is imported lazily and only touched
 * when the app is actually running inside the Android/iOS shell.
 */
import { isNativeShell } from "./platform";

let started = false;

export async function initNativeShell() {
  if (started || typeof window === "undefined" || !isNativeShell()) return;
  started = true;

  try {
    const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
      import("@capacitor/splash-screen"),
      import("@capacitor/status-bar"),
      import("@capacitor/app"),
    ]);

    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#0F172A" });
    } catch {
      /* status bar colouring is unsupported on some devices */
    }

    // Hardware back button: step back in history, exit only at the root.
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });

    await SplashScreen.hide();
  } catch {
    /* running outside the native shell */
  }
}
