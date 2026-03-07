package com.simuladorvr.tablet;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        // Expose native bridge to WebView for HDMI switching
        getBridge().getWebView().addJavascriptInterface(new HdmiBridge(), "NativeBridge");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
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
    }

    /**
     * JS bridge: window.NativeBridge.*
     * - switchToHdmi1() / switchToApp() — HDMI input control
     * - screenOff() / screenOn() — screen power control via brightness
     */
    public class HdmiBridge {
        @JavascriptInterface
        public void switchToHdmi1() {
            try {
                Runtime.getRuntime().exec(new String[]{"input", "keyevent", "243"});
            } catch (Exception e) {
                e.printStackTrace();
            }
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
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                });
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void screenOff() {
            runOnUiThread(() -> {
                try {
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = 0.0f;
                    getWindow().setAttributes(lp);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void screenOn() {
            runOnUiThread(() -> {
                try {
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = -1.0f; // system default
                    getWindow().setAttributes(lp);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }
}
