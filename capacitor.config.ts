import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cathy.operations",
  appName: "CATHY",
  // Native shells load the live site (see server.url below); this folder is
  // only a fallback shell so Capacitor has a valid local web directory.
  webDir: "mobile-shell",
  bundledWebRuntime: false,
  // The platform runs server-side logic (auth, billing, sync), so the native
  // shells load the published production build rather than a static copy.
  server: {
    url: "https://getcathy.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: ["getcathy.lovable.app", "*.lovable.app", "*.paddle.com", "*.supabase.co"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0F172A",
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0F172A",
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0F172A",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0F172A",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
} as CapacitorConfig;

export default config;
