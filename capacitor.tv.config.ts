import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.simuladorvr.tv",
  appName: "SimuladorVR TV",
  webDir: "public",
  server: {
    url: "https://simuladorvr.vercel.app/tv/1",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0D0008",
      overlaysWebView: true,
    },
  },
};

export default config;
