package com.simuladorvr.tablet;

import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock cpuWakeLock;

    // ── Native liveness heartbeat ────────────────────────────────────────────
    // Posts to the backend every HEARTBEAT_INTERVAL_SEC so the admin knows this
    // device is on. Runs on a native thread — NOT the WebView — so it keeps
    // beating even while the TV is on the PlayStation HDMI input and Chromium
    // has frozen the WebView (which stops all JS timers). The WebView tells us
    // who we are once via registerDevice(); native takes it from there.
    private static final String HEARTBEAT_URL = "https://simuladorvr.vercel.app/api/devices/heartbeat";
    private static final long HEARTBEAT_INTERVAL_SEC = 15;
    private ScheduledExecutorService heartbeatExec;
    private volatile String heartbeatPuestoId;
    private volatile String heartbeatDeviceType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setImmersive();
        setupKiosk();      // whitelist this app for lock-task if we're Device Owner
        startKioskLock();  // enter lock-task (hides bars, blocks exit) if permitted

        // Kiosk: the moment the system bars reappear (edge swipe, dialog, etc.)
        // re-hide them immediately, so the Android toolbar is never left visible.
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0
                || (visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
                getWindow().getDecorView().postDelayed(this::setImmersive, 300);
            }
        });

        // Keep CPU alive even when screen is off so polling continues
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SimuladorVR::CPU");
        cpuWakeLock.acquire();

        getBridge().getWebView().addJavascriptInterface(new TVBridge(), "NativeBridge");
    }

    @Override
    public void onResume() {
        super.onResume();
        setImmersive();
        startKioskLock();
    }

    /**
     * If this app is the Device Owner, whitelist it for lock-task and configure
     * lock-task to hide EVERYTHING (nav bar, status bar, home, recents). This is
     * what screen pinning cannot do — pinning forces the nav bar to stay visible.
     * No-op when not Device Owner, so a normal install just behaves as before.
     */
    private void setupKiosk() {
        try {
            DevicePolicyManager dpm =
                (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm == null || !dpm.isDeviceOwnerApp(getPackageName())) return;
            ComponentName admin = new ComponentName(this, AdminReceiver.class);
            dpm.setLockTaskPackages(admin, new String[]{ getPackageName() });
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // FEATURE_NONE = no system UI at all → nav + status bars hidden.
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    /** Enters lock-task mode if the app is permitted (i.e. Device Owner set it up). */
    private void startKioskLock() {
        try {
            DevicePolicyManager dpm =
                (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm == null || !dpm.isLockTaskPermitted(getPackageName())) return;
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask();
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onDestroy() {
        if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
            cpuWakeLock.release();
        }
        if (heartbeatExec != null) {
            heartbeatExec.shutdownNow();
        }
        super.onDestroy();
    }

    /** Starts the heartbeat loop once; subsequent calls are no-ops. */
    private synchronized void startHeartbeat() {
        if (heartbeatExec != null) return;
        heartbeatExec = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "SimuladorVR-Heartbeat");
            t.setDaemon(true);
            return t;
        });
        heartbeatExec.scheduleWithFixedDelay(
            this::sendHeartbeat, 0, HEARTBEAT_INTERVAL_SEC, TimeUnit.SECONDS);
    }

    /** Fires a single heartbeat POST. Failures are swallowed — next tick retries. */
    private void sendHeartbeat() {
        String puestoId = heartbeatPuestoId;
        String deviceType = heartbeatDeviceType;
        if (puestoId == null || deviceType == null) return;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(HEARTBEAT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            String body = "{\"puestoId\":\"" + puestoId + "\",\"deviceType\":\"" + deviceType + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
            }
            conn.getResponseCode(); // triggers the request
        } catch (Exception e) {
            // network hiccup — ignore
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) setImmersive();
    }

    private void setImmersive() {
        // Android 11+ (API 30): the deprecated SYSTEM_UI_FLAG_* no longer hide
        // the bars reliably (on A14 a lone Back button lingers). Use the modern
        // WindowInsetsController, which hides status + nav bars entirely and
        // only shows them transiently on an edge swipe.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
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

    public class TVBridge {

        /**
         * Called once by the WebView after it resolves which puesto it is and
         * whether it's the TABLET or TV surface. Hands those to the native
         * heartbeat loop, which then reports liveness on its own — surviving the
         * WebView freeze that happens on the PlayStation HDMI input.
         */
        @JavascriptInterface
        public void registerDevice(String puestoId, String deviceType) {
            if (puestoId == null || puestoId.isEmpty()) return;
            heartbeatPuestoId = puestoId;
            heartbeatDeviceType = "TV".equals(deviceType) ? "TV" : "TABLET";
            startHeartbeat();
        }

        @JavascriptInterface
        public void switchToHdmi1() {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW4"));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void switchToApp() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(MainActivity.this, MainActivity.class);
                    intent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK |
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    );
                    startActivity(intent);
                } catch (Exception e) { e.printStackTrace(); }
            });
        }

        /**
         * Programa el retorno automático a la app tras {@code delayMs} milisegundos.
         * Usa AlarmManager, así que funciona aun cuando el WebView esté suspendido
         * (lo que pasa mientras la TV está en HDMI y el JS se congela).
         *
         * Llamar desde JS inmediatamente ANTES de switchToHdmi1(), pasando la
         * duración del turno en ms. Si el turno se corta antes, llamar a
         * cancelScheduledReturn() para cancelar la alarma.
         */
        @JavascriptInterface
        public void scheduleReturn(long delayMs) {
            try {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                long triggerAt = SystemClock.elapsedRealtime() + delayMs;
                int piFlags = PendingIntent.FLAG_CANCEL_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                );
                PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 1001, intent, piFlags);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                } else {
                    am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                }
            } catch (Exception e) { e.printStackTrace(); }
        }

        /** Cancela una alarma pendiente de scheduleReturn(). */
        @JavascriptInterface
        public void cancelScheduledReturn() {
            try {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                int piFlags = PendingIntent.FLAG_NO_CREATE
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 1001, intent, piFlags);
                if (pi != null) am.cancel(pi);
            } catch (Exception e) { e.printStackTrace(); }
        }

        /** True si Android concedió el permiso de overlay. Sin esto, switchToApp()
         *  desde background puede ser bloqueado por Android 10+ (Background Activity Starts). */
        @JavascriptInterface
        public boolean hasOverlayPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
            return Settings.canDrawOverlays(MainActivity.this);
        }

        /** Abre Ajustes para que el usuario active "Mostrar sobre otras apps".
         *  Llamar una sola vez en el onboarding de la TV. */
        @JavascriptInterface
        public void requestOverlayPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            if (Settings.canDrawOverlays(MainActivity.this)) return;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())
                    );
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) { e.printStackTrace(); }
            });
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

        /**
         * Escape hatch: leaves lock-task and relinquishes Device Owner so the
         * tablet returns to a normal device (no factory reset needed). Callable
         * from the WebView (e.g. a hidden admin gesture) if we ever need to
         * un-kiosk a tablet in the field.
         */
        @JavascriptInterface
        public void exitKiosk() {
            runOnUiThread(() -> {
                try {
                    stopLockTask();
                    DevicePolicyManager dpm = (DevicePolicyManager)
                        getSystemService(Context.DEVICE_POLICY_SERVICE);
                    if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
                        dpm.clearDeviceOwnerApp(getPackageName());
                    }
                } catch (Exception e) { e.printStackTrace(); }
            });
        }
    }
}
