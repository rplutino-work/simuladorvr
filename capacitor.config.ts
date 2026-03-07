import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.simuladorvr.tablet",
  appName: "SimuladorVR",
  // We point the WebView directly to the live Vercel deployment.
  // This way the tablet app always has the latest version without rebuilding.
  webDir: "public", // fallback (not used when server.url is set)
  server: {
    url: "https://simuladorvr.vercel.app/tablet",
    cleartext: false, // HTTPS only
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set to true during dev
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0D0008",
      overlaysWebView: false,
    },
    ScreenOrientation: {
      // Lock to landscape for the best tablet racing experience
    },
  },
};

export default config;
