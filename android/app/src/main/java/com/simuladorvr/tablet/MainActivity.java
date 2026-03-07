package com.simuladorvr.tablet;

import android.os.Bundle;
import android.os.PowerManager;
import android.content.Context;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock cpuWakeLock;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setImmersive();

        // Keep CPU alive even when screen is off so polling continues
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SimuladorVR::CPU");
        cpuWakeLock.acquire();

        getBridge().getWebView().addJavascriptInterface(new TVBridge(), "NativeBridge");
    }

    @Override
    protected void onDestroy() {
        if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
            cpuWakeLock.release();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) setImmersive();
    }

    private void setImmersive() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    public class TVBridge {

        @JavascriptInterface
        public void switchToHdmi1() {
            try {
                Runtime.getRuntime().exec(new String[]{"input", "keyevent", "243"});
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void switchToApp() {
            try {
                Runtime.getRuntime().exec(new String[]{"input", "keyevent", "3"});
                runOnUiThread(() -> {
                    try {
                        android.content.Intent intent = new android.content.Intent(MainActivity.this, MainActivity.class);
                        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                        startActivity(intent);
                    } catch (Exception e) { e.printStackTrace(); }
                });
            } catch (Exception e) { e.printStackTrace(); }
        }

        /** Puts the TV to sleep (screen off, CPU stays on for polling) */
        @JavascriptInterface
        public void turnOff() {
            try {
                runOnUiThread(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
                // KEYCODE_SLEEP = 223 — puts device into standby
                Runtime.getRuntime().exec(new String[]{"input", "keyevent", "223"});
            } catch (Exception e) { e.printStackTrace(); }
        }

        /** Wakes the TV up and brings our app to foreground */
        @JavascriptInterface
        public void turnOn() {
            try {
                // KEYCODE_WAKEUP = 224 — wakes device from standby
                Runtime.getRuntime().exec(new String[]{"input", "keyevent", "224"});
                Thread.sleep(500);
                runOnUiThread(() -> {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    android.content.Intent intent = new android.content.Intent(MainActivity.this, MainActivity.class);
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(intent);
                    setImmersive();
                });
            } catch (Exception e) { e.printStackTrace(); }
        }

        /** Legacy brightness control (kept for compatibility) */
        @JavascriptInterface
        public void screenOff() { turnOff(); }

        @JavascriptInterface
        public void screenOn() { turnOn(); }
    }
}
