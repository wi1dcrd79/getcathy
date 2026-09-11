import { useEffect, useState } from "react";

/** Stable web console URL used for billing when running inside the native app. */
export const WEB_CONSOLE_URL = "https://project--f32e5ca4-7ae0-4134-8784-a0c93f72246e.lovable.app";
export const WEB_BILLING_URL = `${WEB_CONSOLE_URL}/?billing=manage`;

/** True when running inside the Capacitor native shell. */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  const ua = navigator.userAgent || "";
  return /capacitor|cathy-native|\bwv\b.*Android.*CATHY/i.test(ua) || location.protocol === "capacitor:";
}

/**
 * Google Play multi-platform billing guard: on native shells and compact mobile
 * viewports we never surface in-app card entry — users manage billing on the web console.
 */
export function useExternalBillingGuard() {
  const [guarded, setGuarded] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      const isNative = isNativeShell();
      setNative(isNative);
      setGuarded(isNative || window.innerWidth < 768);
    };
    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

  return { guarded, native, webBillingUrl: WEB_BILLING_URL };
}
