package com.simuladorvr.tablet;

import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
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
    private static final long HEARTBEAT_INTERVAL_SEC = 30; // 30s (antes 15s) — mitad de invocaciones
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
        startBootWatchdog(); // win the boot focus race vs the TV launcher
        ensureWifi();      // como device-owner, configurar/reconectar el WiFi solo

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

        applyDeviceConfig(); // fija el puesto desde almacenamiento PERSISTENTE (no localStorage)
        showConnectingOverlay(); // tapa la pantalla de error de Chrome desde el arranque
        startWebRetryWatchdog(); // reload until the web app actually boots
    }

    // ── Puesto persistente (SharedPreferences, NO localStorage) ──────────────
    // El puesto no puede vivir en el localStorage del WebView: se borra con
    // cualquier limpieza de caché, reinstalación o wipe, y la tablet vuelve a
    // pedir "elegí puesto". Lo guardamos en SharedPreferences nativas (sobreviven
    // reinicios, caché y wipes) y, si está seteado, forzamos la URL del puesto en
    // CADA arranque — así queda fijo para siempre.
    private static final String CFG = "rr_device";

    // ── WiFi auto-config (device owner) ──────────────────────────────────────
    // Cuando la red del local cambia (p. ej. separan 2.4/5G o cambian el modo de
    // seguridad), los equipos quedan sin conectar y no se puede arreglar por el
    // menú (lo tapa el kiosco) ni por adb (bloqueado sin root). Como esta app es
    // device-owner, SÍ puede configurar y conectar el WiFi por API. Guardamos la
    // red en SharedPreferences (por defecto Claro01/20304050) y la reafirmamos en
    // cada arranque si no estamos conectados. Se puede cambiar por adb (run-as)
    // sin recompilar.
    private void ensureWifi() {
        try {
            SharedPreferences cfg = getSharedPreferences(CFG, MODE_PRIVATE);
            String ssid = cfg.getString("wifiSsid", "Claro01");
            String pass = cfg.getString("wifiPass", "20304050");
            if (ssid == null || ssid.isEmpty()) return;
            WifiManager wifi =
                (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) return;
            if (!wifi.isWifiEnabled()) {
                try { wifi.setWifiEnabled(true); } catch (Exception ignored) {}
            }
            // ¿ya conectado a ese SSID? entonces no tocar nada.
            WifiInfo info = wifi.getConnectionInfo();
            if (info != null && info.getNetworkId() != -1 && info.getSSID() != null
                && info.getSSID().replace("\"", "").equals(ssid)) {
                return;
            }
            // Config WPA2-PSK (KeyMgmt WPA_PSK cubre WPA/WPA2), evitando el lío de
            // WPA3/mixto que dejó a los equipos sin asociar.
            WifiConfiguration conf = new WifiConfiguration();
            conf.SSID = "\"" + ssid + "\"";
            conf.preSharedKey = "\"" + pass + "\"";
            conf.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);
            conf.status = WifiConfiguration.Status.ENABLED;
            int netId = wifi.addNetwork(conf);
            android.util.Log.i("RRWifi", "addNetwork(" + ssid + ") -> " + netId);
            if (netId == -1) {
                // Ya existía guardada: buscarla y usar su id.
                try {
                    java.util.List<WifiConfiguration> cfgs = wifi.getConfiguredNetworks();
                    android.util.Log.i("RRWifi", "getConfiguredNetworks size=" + (cfgs == null ? "null" : cfgs.size()));
                    if (cfgs != null) {
                        for (WifiConfiguration c : cfgs) {
                            if (c != null && c.SSID != null
                                && c.SSID.replace("\"", "").equals(ssid)) {
                                netId = c.networkId;
                                break;
                            }
                        }
                    }
                } catch (Exception ex) { android.util.Log.e("RRWifi", "getConfigured fail", ex); }
            }
            if (netId != -1) {
                wifi.disconnect();
                boolean en = wifi.enableNetwork(netId, true);
                boolean re = wifi.reconnect();
                android.util.Log.i("RRWifi", "enableNetwork=" + en + " reconnect=" + re + " netId=" + netId);
            } else {
                // Fallback: network suggestions (device-owner en equipo administrado
                // no requiere aprobación del usuario).
                try {
                    android.net.wifi.WifiNetworkSuggestion sug =
                        new android.net.wifi.WifiNetworkSuggestion.Builder()
                            .setSsid(ssid)
                            .setWpa2Passphrase(pass)
                            .build();
                    int r = wifi.addNetworkSuggestions(java.util.Collections.singletonList(sug));
                    android.util.Log.i("RRWifi", "addNetworkSuggestions -> " + r);
                } catch (Exception ex) { android.util.Log.e("RRWifi", "suggestions fail", ex); }
            }
        } catch (Exception e) { android.util.Log.e("RRWifi", "ensureWifi fail", e); }
    }

    private void applyDeviceConfig() {
        try {
            SharedPreferences cfg = getSharedPreferences(CFG, MODE_PRIVATE);
            String puestoId = cfg.getString("puestoId", null);
            String deviceType = cfg.getString("deviceType", null);
            if (puestoId == null || puestoId.isEmpty()
                || deviceType == null || deviceType.isEmpty()) return;
            final String url = "https://simuladorvr.vercel.app/" + deviceType + "/" + puestoId;
            getBridge().getWebView().post(() -> {
                try { getBridge().getWebView().loadUrl(url); } catch (Exception e) { e.printStackTrace(); }
            });
        } catch (Exception e) { e.printStackTrace(); }
    }

    // ── Overlay nativo de "conectando / sin internet" ────────────────────────
    // Mientras la web no bootea, el WebView muestra la fea "página no disponible"
    // de Chrome. Ponemos ENCIMA una pantalla propia (logo + loader + mensaje
    // claro) que el cliente ve en su lugar. Se oculta apenas la web arranca
    // (registerDevice). Sirve tanto para "sin internet al prender" como para el
    // flash blanco de carga.
    private View connectingOverlay;
    private TextView connectingStatus;

    private void showConnectingOverlay() {
        try {
            if (connectingOverlay != null || pageLoadedOnce) return;
            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setGravity(Gravity.CENTER);
            root.setBackgroundColor(0xFF0A0A0C);
            root.setClickable(true);   // consumir toques: no dejar tocar la página rota
            root.setFocusable(true);

            ImageView logo = new ImageView(this);
            try { logo.setImageResource(R.drawable.rr_logo); } catch (Exception ignored) {}
            logo.setAdjustViewBounds(true);
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            LinearLayout.LayoutParams logoLp =
                new LinearLayout.LayoutParams(dp(200), dp(200));
            root.addView(logo, logoLp);

            ProgressBar spinner = new ProgressBar(this);
            spinner.setIndeterminate(true);
            try {
                spinner.getIndeterminateDrawable().setColorFilter(
                    0xFFE60012, android.graphics.PorterDuff.Mode.SRC_IN);
            } catch (Exception ignored) {}
            LinearLayout.LayoutParams spLp = new LinearLayout.LayoutParams(dp(52), dp(52));
            spLp.topMargin = dp(44);
            root.addView(spinner, spLp);

            connectingStatus = new TextView(this);
            connectingStatus.setText("Conectando…");
            connectingStatus.setTextColor(0xFFCCCCCC);
            connectingStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            connectingStatus.setGravity(Gravity.CENTER);
            connectingStatus.setLineSpacing(dp(4), 1f);
            LinearLayout.LayoutParams stLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            stLp.topMargin = dp(28);
            root.addView(connectingStatus, stLp);

            addContentView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            connectingOverlay = root;
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void updateConnectingStatus() {
        try {
            if (connectingStatus == null) return;
            if (!isNetworkAvailable()) {
                connectingStatus.setText("Sin internet todavía\nReconectando…");
            } else {
                connectingStatus.setText("Conectando…");
            }
        } catch (Exception ignored) {}
    }

    private void hideConnectingOverlay() {
        try {
            View o = connectingOverlay;
            connectingOverlay = null;
            connectingStatus = null;
            if (o == null) return;
            if (o.getParent() instanceof ViewGroup) {
                ((ViewGroup) o.getParent()).removeView(o);
            } else {
                o.setVisibility(View.GONE);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    // ── Network-fail auto-retry ──────────────────────────────────────────────
    // On power-up the device can come up BEFORE WiFi/DNS is ready. The WebView
    // then shows Chromium's native "página no disponible" (ERR_NAME_NOT_RESOLVED)
    // and sits there forever — that's the 15-minute hang seen in the field.
    // We can't cleanly hook Capacitor's WebViewClient, so we use a positive
    // signal instead: the web app calls NativeBridge.registerDevice() the moment
    // its JS runs (see app/tablet & app/tv). Until that fires, the page hasn't
    // loaded, so we reload every RETRY_INTERVAL_MS whenever the network is up.
    // Once it loads once, we stop for good — so a mid-session network blip never
    // triggers a reload that would interrupt a running session.
    private volatile boolean pageLoadedOnce = false;
    private static final long WEB_RETRY_INTERVAL_MS = 8000;
    private final Handler retryHandler = new Handler(Looper.getMainLooper());

    private final Runnable retryRunnable = new Runnable() {
        @Override public void run() {
            if (pageLoadedOnce) return; // booted OK — stop retrying forever
            try {
                updateConnectingStatus(); // "sin internet" vs "conectando"
                if (isNetworkAvailable()) {
                    getBridge().getWebView().reload();
                }
            } catch (Exception e) { e.printStackTrace(); }
            retryHandler.postDelayed(this, WEB_RETRY_INTERVAL_MS);
        }
    };

    private void startWebRetryWatchdog() {
        retryHandler.removeCallbacks(retryRunnable);
        retryHandler.postDelayed(retryRunnable, WEB_RETRY_INTERVAL_MS);
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network n = cm.getActiveNetwork();
                if (n == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                return caps != null
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    // ¿Está nuestra app en primer plano? La usamos para NO re-afirmar cuando ya
    // se ve la app (evita parpadeos), y para detectar cuándo la TV está en la
    // consola (background) sin turno pagado → volver a la app.
    private volatile boolean activityForeground = false;
    // Latidos consecutivos SIN turno pagado. Sirve para dos cosas:
    //  (1) DEBOUNCE: no reafirmar por UN latido "sin sesión" transitorio (evita el
    //      parpadeo de salir del juego en medio de una carrera).
    //  (2) FALLBACK: si la bandera activityForeground se traba en "primer plano"
    //      (pasa en las TCL: al ir al HDMI no siempre dispara onPause), tras varios
    //      latidos sin sesión reafirmamos IGUAL — así igual echa al juego gratis.
    private volatile int noSessionStreak = 0;

    // ── Anti-fuga AGRESIVO (solo TV): watchdog local rápido ──────────────────
    // El heartbeat (30s) tardaba ~1 min en echar a la consola sin turno, y en las
    // TCL el HDMI no dispara onPause (no hay señal instantánea). Este watchdog
    // corre cada pocos segundos SIN costo de red: si es TV, la pantalla debe estar
    // prendida y NO hay turno pagado, trae la app al frente (sale del HDMI en ≤3s).
    // Cuando ya está en la app es no-op: REORDER_TO_FRONT a la instancia top y no
    // hay onNewIntent → no recarga el WebView ni parpadea.
    // Cada 1s. Es un chequeo LOCAL (compara timestamps, NO hace red), así que
    // bajarlo no cuesta consumo de Vercel: la fuga y el gasto son cosas separadas.
    // 1s acota la ventana máxima de fuga a la mitad vs los 2s previos. Cuando ya
    // está en la app es no-op (REORDER_TO_FRONT sin onNewIntent → no recarga ni
    // parpadea), así que correrlo más seguido es barato. Ajustable: si en el local
    // se ve que hace falta aún más agresivo (o menos), se toca solo este número.
    private static final long ANTIFREE_INTERVAL_MS = 1000; // cada 1s (local, sin red)
    // Fin del turno en curso, conocido LOCALMENTE (base elapsedRealtime). Lo setea
    // scheduleReturn() justo antes de ir a HDMI: es la señal autoritativa de "hay
    // una partida paga corriendo, NO tocar". 0 = no hay turno local.
    private volatile long sessionActiveUntilMs = 0;
    // Cuándo se seteó sessionActiveUntilMs (base elapsedRealtime). Sirve de gracia
    // de arranque: recién iniciada la sesión el heartbeat todavía no confirmó, así
    // que no dejamos que un latido rezagado ("no hay sesión") la limpie de una.
    private volatile long localSetAtMs = 0;
    // Fin (base elapsedRealtime) al que apunta la alarma de retorno ya armada. Sirve
    // para NO reprogramar la alarma exacta en cada latido cuando el fin no cambió;
    // sólo se re-arma si el fin se corrió (p.ej. una extensión).
    private volatile long alarmArmedUntilMs = 0;
    // Último hasActiveSession que dijo el server en el heartbeat.
    private volatile boolean heartbeatSession = false;
    // Último shouldBeOn del server (fuera de horario / puesto inactivo → false).
    private volatile boolean lastShouldBeOn = true;
    private final Handler antiFreeHandler = new Handler(Looper.getMainLooper());
    private volatile boolean antiFreeStarted = false;

    // ── Gracia de Ajustes ────────────────────────────────────────────────────
    // Cuando el operador entra a Ajustes con Atrás×5, TODOS los mecanismos que
    // traen la app al frente (watchdog rápido, reafirmación por heartbeat y
    // watchdog de arranque) deben PAUSARSE: si no, el menú se cierra solo en ≤2s
    // y no se puede, p.ej., emparejar auriculares Bluetooth. Acotada a unos
    // minutos: si se olvidan el menú abierto, el anti-fuga se reactiva y el
    // kiosco se re-bloquea solo. Se limpia apenas el operador vuelve a la app
    // (onResume). No hay riesgo de fuga durante la gracia: la TV muestra Ajustes,
    // no el HDMI de la consola, y el operador está presente frente al equipo.
    private static final long SETTINGS_GRACE_MS = 2 * 60 * 1000; // 2 min (vuelve el anti-fuga)
    private volatile long settingsGraceUntilMs = 0;
    private boolean inSettingsGrace() {
        return SystemClock.elapsedRealtime() < settingsGraceUntilMs;
    }

    /**
     * ¿Hay una partida paga corriendo? Se decide con la señal LOCAL
     * (sessionActiveUntilMs). Esa señal la mantiene fresca el heartbeat: la setea
     * scheduleReturn() al ir a HDMI, la limpia cancelScheduledReturn() al terminar
     * normal, Y la limpia el propio heartbeat si el server dice "no hay sesión"
     * (fin anticipado desde la tablet/admin, que el WebView congelado en HDMI no
     * puede avisar). Así el watchdog saca del HDMI en ≤2s del aviso.
     */
    private boolean sessionActiveNow() {
        return SystemClock.elapsedRealtime() < sessionActiveUntilMs;
    }

    private void startAntiFreeWatchdog() {
        if (antiFreeStarted) return;
        antiFreeStarted = true;
        antiFreeHandler.postDelayed(antiFreeRunnable, ANTIFREE_INTERVAL_MS);
    }

    private final Runnable antiFreeRunnable = new Runnable() {
        @Override public void run() {
            try {
                if ("TV".equals(heartbeatDeviceType) && lastShouldBeOn && !sessionActiveNow()
                        && !inSettingsGrace()) {
                    bringAppToFront();
                }
            } catch (Exception e) { e.printStackTrace(); }
            antiFreeHandler.postDelayed(this, ANTIFREE_INTERVAL_MS);
        }
    };

    /** Trae la app al frente (liviano, sin WAKEUP). No-op si ya está arriba; saca
     *  del HDMI si la TV está en la consola. Lo usa el watchdog rápido. */
    private void bringAppToFront() {
        runOnUiThread(() -> {
            try {
                Intent i = new Intent(MainActivity.this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            } catch (Exception e) { e.printStackTrace(); }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        activityForeground = true;
        // El operador volvió del menú de Ajustes → el anti-fuga se reactiva ya.
        settingsGraceUntilMs = 0;
        setImmersive();
        startKioskLock();
    }

    @Override
    public void onPause() {
        super.onPause();
        activityForeground = false;
        // NOTA: antes disparábamos un heartbeat inmediato acá para reaccionar al
        // instante. Lo sacamos: durante las peleas app↔HDMI se disparaba en bucle
        // (miles de latidos = costo). El anti-juego-gratis igual funciona con el
        // heartbeat programado + el debounce (reacciona en ~1 min, suficiente).
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
            // Whitelist our app PLUS the TV HDMI input services, so that on the
            // TV kiosks switchToHdmi1() (showing the PlayStation) still works
            // while locked. Harmless on tablets where those packages don't exist.
            dpm.setLockTaskPackages(admin, new String[]{
                getPackageName(),
                "com.mediatek.tvinput",
                "com.google.android.tv.inputplayer",
                // Tailscale (nodo de acceso remoto): permitido en lock-task para
                // poder abrirlo/configurarlo sin sacar el kiosco. Inofensivo en
                // los equipos donde no está instalado.
                "com.tailscale.ipn"
            });
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // FEATURE_NONE = no system UI at all → nav + status bars hidden.
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            }
            // Make this app the default HOME, so it auto-starts on boot (Google
            // TV boots to its own launcher otherwise) and Home always returns
            // here. Persistent-preferred survives reboots.
            IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.addCategory(Intent.CATEGORY_DEFAULT);
            dpm.addPersistentPreferredActivity(
                admin, home, new ComponentName(this, MainActivity.class));
        } catch (Exception e) { e.printStackTrace(); }
    }

    // On boot the TV launcher (Google TV) can win the initial focus, leaving our
    // app in the background where it can't enter lock-task. Este watchdog empuja
    // la app al frente y la bloquea repetidamente hasta ganar — y SE DETIENE
    // apenas queda fija (lock-task). Google TV a veces tarda &gt;25s en asentarse
    // tras un corte de luz, así que la ventana es de 3 min (segura: se corta al
    // ganar, y en ese arranque no hay turnos pagados).
    private final Handler kioskHandler = new Handler(Looper.getMainLooper());
    private long kioskWatchUntil = 0;

    private void startBootWatchdog() {
        kioskWatchUntil = System.currentTimeMillis() + 180_000; // 3 min
        kioskHandler.removeCallbacks(kioskWatchRunnable);
        kioskHandler.postDelayed(kioskWatchRunnable, 1000);
    }

    private final Runnable kioskWatchRunnable = new Runnable() {
        @Override public void run() {
            boolean locked = false;
            try {
                DevicePolicyManager dpm = (DevicePolicyManager)
                    getSystemService(Context.DEVICE_POLICY_SERVICE);
                ActivityManager am = (ActivityManager)
                    getSystemService(Context.ACTIVITY_SERVICE);
                boolean owner = dpm != null && dpm.isDeviceOwnerApp(getPackageName());
                locked = am != null
                    && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
                if (owner && !locked && !inSettingsGrace()) {
                    Intent i = new Intent(MainActivity.this, MainActivity.class);
                    i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(i);
                    startKioskLock();
                }
            } catch (Exception e) { e.printStackTrace(); }
            if (!locked && System.currentTimeMillis() < kioskWatchUntil) {
                kioskHandler.postDelayed(this, 1500);
            }
        }
    };

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
        scheduleNextBeat(0);
    }

    // Latido ADAPTATIVO: rápido (6s) mientras hay una sesión local activa —la TV
    // está en HDMI y el WebView congelado no puede avisar de un fin anticipado—,
    // y lento (30s) cuando está idle, para no consumir de más.
    private static final long HEARTBEAT_IDLE_MS = 30000;
    private static final long HEARTBEAT_SESSION_MS = 6000;

    private void scheduleNextBeat(long delayMs) {
        if (heartbeatExec == null || heartbeatExec.isShutdown()) return;
        heartbeatExec.schedule(() -> {
            sendHeartbeat();
            long next = (SystemClock.elapsedRealtime() < sessionActiveUntilMs)
                ? HEARTBEAT_SESSION_MS : HEARTBEAT_IDLE_MS;
            scheduleNextBeat(next);
        }, delayMs, TimeUnit.MILLISECONDS);
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
            int rc = conn.getResponseCode(); // triggers the request

            // Leer la respuesta: el server dice si hay un turno PAGADO corriendo.
            StringBuilder sb = new StringBuilder();
            if (rc >= 200 && rc < 300) {
                try (java.io.InputStream is = conn.getInputStream()) {
                    byte[] buf = new byte[512];
                    int n;
                    while ((n = is.read(buf)) != -1) sb.append(new String(buf, 0, n, "UTF-8"));
                }
            }
            // Sólo evaluamos con una respuesta VÁLIDA del server (2xx). Si el latido
            // falló (red), no tocamos la racha: no sabemos el estado, no reafirmamos.
            if (rc >= 200 && rc < 300) {
                boolean hasSession = sb.indexOf("\"hasActiveSession\":true") >= 0;
                // shouldBeOn = true salvo que el server diga explícitamente false
                // (fuera de horario / puesto inactivo). Si falta el campo (backend
                // viejo), se asume true. Así el latido NO reafirma cuando la pantalla
                // debe estar apagada → evita el loop de apagar/prender.
                boolean shouldBeOn = sb.indexOf("\"shouldBeOn\":false") < 0;

                // Alimenta al watchdog rápido anti-fuga (respaldo del estado local).
                heartbeatSession = hasSession;
                lastShouldBeOn = shouldBeOn;

                // Racha de latidos SIN sesión — se calcula ANTES de decidir nada, así
                // el DEBOUNCE protege por igual al borrado y a la reafirmación: un
                // latido malo AISLADO (racha = 1) nunca toca la sesión ni saca la TV.
                if (hasSession) {
                    noSessionStreak = 0;            // hay turno → reset, jamás molestar
                } else if (noSessionStreak < 1000) {
                    noSessionStreak++;
                }
                boolean confirmedNoSession = !hasSession && noSessionStreak >= 2;

                if (hasSession) {
                    // El server manda el tiempo restante REAL. Re-sincronizamos SÓLO el
                    // timer del watchdog rápido (si una lectura mala aislada borró el
                    // timer, el próximo latido bueno lo restaura; y una EXTENSIÓN "sigue"
                    // al juego). NO tocamos la alarma de retorno: queda FIJA en el fin que
                    // puso scheduleReturn al arrancar el turno. Es un backstop
                    // INDEPENDIENTE DE LA RED que SIEMPRE saca del HDMI al terminar,
                    // aunque el heartbeat falle o traiga un dato atrasado. (Re-armarla
                    // desde acá la podía correr MÁS ALLÁ del fin real en redes inestables
                    // → la TV quedaba en el juego pasado el turno = fuga.) Si el server es
                    // viejo y no manda el campo, parseLongField da -1 y no tocamos nada.
                    long remaining = parseLongField(sb, "\"sessionRemainingMs\":");
                    if (remaining > 0) {
                        sessionActiveUntilMs = SystemClock.elapsedRealtime() + remaining;
                        localSetAtMs = SystemClock.elapsedRealtime();
                    }
                } else if (confirmedNoSession
                        && (SystemClock.elapsedRealtime() - localSetAtMs) > 12000) {
                    // FIN REAL: sólo soltamos con ≥2 latidos seguidos sin sesión (no con
                    // uno) y pasada la gracia de arranque. Cubre "finalizar desde la
                    // tablet/admin" — el WebView congelado en HDMI no puede avisar.
                    sessionActiveUntilMs = 0;
                }

                // SOLO en la TV: si la pantalla DEBE estar prendida y NO hay turno
                // pagado (confirmado por ≥2 latidos), la TV está en la consola
                // (jugando gratis, o el admin canceló) → volver a la app. FALLBACK con
                // ≥4 latidos por si la bandera de foreground se trabó.
                boolean appNotOnTop = !activityForeground || noSessionStreak >= 4;
                if ("TV".equals(deviceType) && shouldBeOn && confirmedNoSession && appNotOnTop
                        && !inSettingsGrace()) {
                    reassertAppNoSession();
                }
            }
        } catch (Exception e) {
            // network hiccup — ignore
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Trae la app al frente, despierta la pantalla y limpia el estado. */
    private void reassertAppNoSession() {
        // Despertar la pantalla si la consola la mandó a standby por CEC
        // (al apagar la Play). Belt-and-suspenders: keyevent + flags de ventana.
        try {
            Runtime.getRuntime().exec(new String[]{"input", "keyevent", "224"}); // WAKEUP
        } catch (Exception e) { e.printStackTrace(); }
        runOnUiThread(() -> {
            try {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
                Intent i = new Intent(MainActivity.this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
                setImmersive();
            } catch (Exception e) { e.printStackTrace(); }
        });
        // Sacar el cartel de "últimos minutos" y cancelar la alarma de retorno.
        bannerHandler.post(this::removeEndingBanner);
        cancelReturnAlarm();
    }

    /** Cancela la alarma de scheduleReturn() si quedó pendiente. */
    private void cancelReturnAlarm() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            int piFlags = PendingIntent.FLAG_NO_CREATE
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            Intent intent = new Intent(MainActivity.this, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 1001, intent, piFlags);
            if (pi != null && am != null) am.cancel(pi);
        } catch (Exception e) { e.printStackTrace(); }
        alarmArmedUntilMs = 0;
    }

    /**
     * Programa (o reprograma) la alarma que trae la app al frente dentro de
     * {@code delayMs}. Reemplaza la anterior (mismo requestCode 1001). Seguro desde
     * cualquier hilo (lo llama tanto el puente JS como el hilo del heartbeat).
     */
    private void armReturnAlarm(long delayMs) {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long triggerAt = SystemClock.elapsedRealtime() + delayMs;
            int piFlags = PendingIntent.FLAG_CANCEL_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            Intent intent = new Intent(MainActivity.this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 1001, intent, piFlags);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            }
            alarmArmedUntilMs = triggerAt;
        } catch (Exception e) { e.printStackTrace(); }
    }

    /**
     * Re-arma la alarma SÓLO si el fin se corrió > 10s respecto de la ya armada
     * (p.ej. una extensión). Evita reprogramar la alarma exacta en cada latido
     * cuando el fin no cambió — el heartbeat pega cada ~6s.
     */
    private void rearmReturnAlarmIfShifted(long remaining) {
        long newUntil = SystemClock.elapsedRealtime() + remaining;
        if (Math.abs(newUntil - alarmArmedUntilMs) > 10_000) {
            armReturnAlarm(remaining);
        }
    }

    /** Extrae el entero que sigue a {@code key} en el JSON crudo del heartbeat.
     *  Devuelve -1 si el campo no está (server viejo) o no parsea. */
    private long parseLongField(StringBuilder sb, String key) {
        try {
            int i = sb.indexOf(key);
            if (i < 0) return -1;
            int j = i + key.length();
            while (j < sb.length() && sb.charAt(j) == ' ') j++;
            int k = j;
            if (k < sb.length() && sb.charAt(k) == '-') k++;
            while (k < sb.length() && Character.isDigit(sb.charAt(k))) k++;
            if (k == j) return -1;
            return Long.parseLong(sb.substring(j, k));
        } catch (Exception e) {
            return -1;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) setImmersive();
    }

    // ── Admin escape hatch ───────────────────────────────────────────────────
    // Pressing BACK 5 times quickly leaves lock-task for a moment and opens the
    // Android Settings, so an operator with the remote can configure the device
    // (WiFi, etc.) without being permanently trapped by the kiosk. Returning to
    // the app re-locks it (onResume → startKioskLock).
    private long lastBackMs = 0;
    private int backTapCount = 0;

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            long now = System.currentTimeMillis();
            if (now - lastBackMs < 800) backTapCount++; else backTapCount = 1;
            lastBackMs = now;
            if (backTapCount >= 5) {
                backTapCount = 0;
                openSettings();
            }
            return true; // swallow Back so it never navigates/exits the kiosk
        }
        return super.onKeyDown(keyCode, event);
    }

    /** Temporarily leaves the kiosk lock and opens Android Settings. */
    private void openSettings() {
        // Pausa el anti-fuga mientras el operador usa Ajustes (WiFi, Bluetooth…),
        // o el menú se cerraría solo en ≤2s. Se limpia al volver (onResume).
        settingsGraceUntilMs = SystemClock.elapsedRealtime() + SETTINGS_GRACE_MS;
        runOnUiThread(() -> {
            try {
                stopLockTask();
                Intent i = new Intent(Settings.ACTION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) { e.printStackTrace(); }
        });
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

    // ── "Últimos minutos" overlay banner (TV) ────────────────────────────────
    // A small pill drawn OVER the PlayStation (system overlay) during the final
    // minutes of a turn. Driven by native Handlers — NOT the WebView, which is
    // frozen while the TV is on the HDMI input — so it appears and counts down
    // even mid-game, and removes itself when the turn ends.
    private View endingBanner;
    private android.animation.ObjectAnimator bannerAnim;
    private final Handler bannerHandler = new Handler(Looper.getMainLooper());
    private Runnable bannerShow;
    private Runnable bannerTick;
    private long bannerEndElapsed;
    private String bannerLabel = "";

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /** Schedules the banner to appear in `startInMs` and stay for `windowMs`. */
    private void scheduleEndingBanner(long startInMs, long windowMs, String label) {
        if (bannerShow != null) bannerHandler.removeCallbacks(bannerShow);
        removeEndingBanner();
        bannerLabel = label != null ? label : "";
        long start = Math.max(0, startInMs);
        bannerEndElapsed = SystemClock.elapsedRealtime() + start + Math.max(0, windowMs);
        bannerShow = this::showEndingBanner;
        bannerHandler.postDelayed(bannerShow, start);
    }

    private void showEndingBanner() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return;
            if (endingBanner != null) return;
            WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return;

            LinearLayout pill = new LinearLayout(this);
            pill.setOrientation(LinearLayout.HORIZONTAL);
            pill.setGravity(Gravity.CENTER_VERTICAL);
            pill.setPadding(dp(18), dp(9), dp(18), dp(9));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(0xB8_0C0C0F);               // translucent near-black
            bg.setCornerRadius(dp(999));
            bg.setStroke(dp(1), 0x8CE60012);         // red border ~55%
            pill.setBackground(bg);

            View dot = new View(this);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setShape(GradientDrawable.OVAL);
            dotBg.setColor(0xFFE60012);
            dot.setBackground(dotBg);
            LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(9), dp(9));
            dotLp.rightMargin = dp(10);
            pill.addView(dot, dotLp);

            TextView label = new TextView(this);
            label.setText(bannerLabel.isEmpty()
                ? "ÚLTIMOS MINUTOS" : ("ÚLTIMOS MINUTOS · " + bannerLabel));
            label.setTextColor(0xFFFFFFFF);
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            label.setLetterSpacing(0.12f);
            label.setTypeface(label.getTypeface(), Typeface.BOLD);
            pill.addView(label);

            final TextView clock = new TextView(this);
            clock.setTextColor(0xFFE60012);
            clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            clock.setTypeface(clock.getTypeface(), Typeface.BOLD);
            LinearLayout.LayoutParams clockLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            clockLp.leftMargin = dp(12);
            pill.addView(clock, clockLp);

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lp.y = dp(10);

            // Envolver el pill en un contenedor con margen: así el latido (que
            // agranda el pill) tiene lugar y no se recorta contra el borde de la
            // ventana del overlay.
            android.widget.FrameLayout wrap = new android.widget.FrameLayout(this);
            int pad = dp(14);
            wrap.setPadding(pad, pad, pad, pad);
            wrap.setClipChildren(false);
            wrap.setClipToPadding(false);
            wrap.addView(pill, new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT));
            wm.addView(wrap, lp);
            endingBanner = wrap;

            // Latido: pulso suave (escala) en bucle para que se note sin molestar.
            android.animation.PropertyValuesHolder sx =
                android.animation.PropertyValuesHolder.ofFloat("scaleX", 1f, 1.06f);
            android.animation.PropertyValuesHolder sy =
                android.animation.PropertyValuesHolder.ofFloat("scaleY", 1f, 1.06f);
            bannerAnim = android.animation.ObjectAnimator.ofPropertyValuesHolder(pill, sx, sy);
            bannerAnim.setDuration(620);
            bannerAnim.setRepeatMode(android.animation.ValueAnimator.REVERSE);
            bannerAnim.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            bannerAnim.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
            bannerAnim.start();

            bannerTick = new Runnable() {
                @Override public void run() {
                    long rem = bannerEndElapsed - SystemClock.elapsedRealtime();
                    if (rem <= 0 || endingBanner == null) { removeEndingBanner(); return; }
                    long s = rem / 1000;
                    clock.setText((s / 60) + ":" + String.format("%02d", s % 60));
                    bannerHandler.postDelayed(this, 1000);
                }
            };
            bannerTick.run();
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void removeEndingBanner() {
        try {
            if (bannerTick != null) bannerHandler.removeCallbacks(bannerTick);
            if (bannerAnim != null) { bannerAnim.cancel(); bannerAnim = null; }
            if (endingBanner != null) {
                WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
                if (wm != null) wm.removeView(endingBanner);
                endingBanner = null;
            }
        } catch (Exception e) { e.printStackTrace(); }
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
            // The web app booted and its JS is running → stop the retry watchdog
            // and reveal the WebView (hide the native "conectando" overlay).
            pageLoadedOnce = true;
            runOnUiThread(MainActivity.this::hideConnectingOverlay);
            heartbeatPuestoId = puestoId;
            heartbeatDeviceType = "TV".equals(deviceType) ? "TV" : "TABLET";
            startHeartbeat();
            startAntiFreeWatchdog(); // TV: saca del HDMI en ≤3s si no hay turno
        }

        /**
         * La web terminó de cargar (la llama TAMBIÉN el selector de puesto, que
         * no invoca registerDevice). Sin esto, en un equipo sin puesto el overlay
         * de "conectando" tapaba el selector para siempre. Ocultamos el overlay.
         */
        @JavascriptInterface
        public void pageReady() {
            pageLoadedOnce = true;
            runOnUiThread(MainActivity.this::hideConnectingOverlay);
        }

        /**
         * Guarda el puesto/tipo de este equipo de forma PERSISTENTE (sobrevive
         * reinicios, borrado de caché y wipes de localStorage). El selector web
         * puede llamarlo al elegir puesto; a partir de ahí el equipo carga
         * siempre su puesto solo, sin volver a preguntar.
         */
        @JavascriptInterface
        public void setDeviceConfig(String puestoId, String deviceType) {
            try {
                if (puestoId == null || puestoId.isEmpty()) return;
                String t = ("TV".equalsIgnoreCase(deviceType) || "tv".equals(deviceType)) ? "tv" : "tablet";
                getSharedPreferences(CFG, MODE_PRIVATE).edit()
                    .putString("puestoId", puestoId)
                    .putString("deviceType", t)
                    .apply();
            } catch (Exception e) { e.printStackTrace(); }
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
            // Señal autoritativa para el watchdog anti-fuga: hay partida paga hasta
            // este momento, así que NO sacar del HDMI hasta entonces. El heartbeat la
            // re-sincroniza en cada latido con el tiempo restante real del server, así
            // que aunque el WebView quede congelado en HDMI, el timer no queda viejo.
            sessionActiveUntilMs = SystemClock.elapsedRealtime() + delayMs;
            localSetAtMs = SystemClock.elapsedRealtime();
            armReturnAlarm(delayMs);
        }

        /**
         * Muestra el cartel de "últimos minutos" sobre el juego. Llamar justo
         * antes de switchToHdmi1(): aparece dentro de {@code startInMs} y cuenta
         * hasta cero durante {@code windowMs}. Los números llegan como double
         * desde JS.
         */
        @JavascriptInterface
        public void showEndingWarning(double startInMs, double windowMs, String label) {
            final long s = (long) startInMs;
            final long w = (long) windowMs;
            runOnUiThread(() -> scheduleEndingBanner(s, w, label));
        }

        /** Saca el cartel (turno cancelado/finalizado o extendido). */
        @JavascriptInterface
        public void cancelEndingWarning() {
            runOnUiThread(() -> {
                if (bannerShow != null) bannerHandler.removeCallbacks(bannerShow);
                removeEndingBanner();
            });
        }

        /** Cancela una alarma pendiente de scheduleReturn(). */
        @JavascriptInterface
        public void cancelScheduledReturn() {
            // Ya no hay partida paga corriendo → el watchdog puede sacar del HDMI.
            sessionActiveUntilMs = 0;
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
                        ComponentName admin = new ComponentName(
                            MainActivity.this, AdminReceiver.class);
                        // Restore the real launcher before relinquishing ownership.
                        dpm.clearPackagePersistentPreferredActivities(
                            admin, getPackageName());
                        dpm.clearDeviceOwnerApp(getPackageName());
                    }
                } catch (Exception e) { e.printStackTrace(); }
            });
        }
    }
}
