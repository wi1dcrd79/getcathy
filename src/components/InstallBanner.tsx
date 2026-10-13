import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { isNativeShell } from "@/lib/platform";

const DISMISS_KEY = "cathy-install-banner-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Compact install prompt for the signed-in dashboard. Only renders in a normal
 * browser tab — never when already installed or inside the Capacitor shell.
 */
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isNativeShell() || isInstalled() || readDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — show the manual hint instead.
    if (isIos() && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — just hide for this session */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div className="no-print mx-auto mt-3 flex max-w-7xl items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5 text-base shadow-sm">
      <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-base text-foreground">
        {iosHint ? "Tap Share, then Add to Home Screen" : "Install C.A.T.H.Y. on this device"}
      </p>
      {!iosHint && deferredPrompt && (
        <button
          type="button"
          onClick={install}
          className="min-h-[48px] shrink-0 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
