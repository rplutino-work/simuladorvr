# Runbook — Resiliencia de arranque en frío (kiosko Race Room)

> **Objetivo:** que un corte total de luz se recupere solo. Se va la luz, vuelve, y en pocos minutos las 5 TVs + 5 tablets están corriendo la app **sin que nadie toque nada**.
>
> **Para:** Nicolás Bonardi (soporte técnico). Requiere el entorno de build Android (JDK 17 + Android SDK) y acceso físico a los equipos (USB o ADB por WiFi).

## Por qué se cuelgan hoy (causa raíz)

Los equipos prenden **antes** de que el router/WiFi/DNS estén listos. La app abre, no puede resolver `simuladorvr.vercel.app`, muestra el error del WebView (`ERR_NAME_NOT_RESOLVED`) y **se queda ahí para siempre** porque no reintenta. Las tablets, además, no siempre bootean al volver la energía.

## La solución (4 piezas)

### 1. APK con auto-reintento — YA está en el código

Cambio hecho en `android/app/src/main/java/com/simuladorvr/tablet/MainActivity.java`:
si el WebView no cargó (la web no llamó a `registerDevice()`), **recarga cada 8 s mientras haya red**, hasta que carga una vez. Después no reintenta más (nunca corta una sesión en curso).

**Build (ambos APK salen del mismo proyecto android):**

```bash
cd "<repo>/simuladorvr"

# --- APK TABLET ---
npx cap copy android          # usa capacitor.config.ts (com.simuladorvr.tablet, /tablet)
cd android && ./gradlew assembleRelease   # o assembleDebug si así se venía firmando
# APK queda en android/app/build/outputs/apk/...

# --- APK TV ---  (mismo proyecto, distinta config/URL)
cd ..
# apuntar Capacitor a la config de TV (com.simuladorvr.tv, /tv/N) como se hizo
# para generar app-tv.apk / app-tv-1.apk (swap de capacitor.tv.config.ts) y:
npx cap copy android
cd android && ./gradlew assembleRelease
```

> Nota: el cambio de `MainActivity.java` aplica a las dos variantes (tablet y TV) porque comparten el proyecto android. Solo hay que recompilar con el repo actual.

**Instalar en cada equipo** (por USB o ADB WiFi, ver más abajo):

```bash
adb -s <serial-o-ip:5555> install -r app-tablet.apk   # o app-tv.apk según el equipo
```

### 2. DNS confiable (Private DNS = dns.google) — se hace por ADB, sin root

Mata el `ERR_NAME_NOT_RESOLVED`: resuelve contra Google por DNS-over-TLS, **independiente del DNS del router** (que tarda/falla al arrancar en frío). **Probado OK** en TV2 (.28) y TV4 (.14) — la app cargó igual.

Por cada equipo (por ADB, no necesita root):

```bash
adb -s <serial-o-ip:5555> shell settings put global private_dns_mode hostname
adb -s <serial-o-ip:5555> shell settings put global private_dns_specifier dns.google
# verificar:
adb -s <serial-o-ip:5555> shell "settings get global private_dns_mode; settings get global private_dns_specifier"
# esperado:  hostname   /   dns.google
```

> **Ya aplicado (2026-08-04):** TV2 (192.168.100.28) y TV4 (192.168.100.14).
> **Falta:** TV1 (.21/.30 — no autorizaba ADB), TV5 y las 5 tablets.

Alternativa por pantalla (si no hay ADB): *Configuración → Red → DNS privado → Nombre de host del proveedor → `dns.google`*. O DNS estático `8.8.8.8` / `1.1.1.1` en la red WiFi.

### 3. Todos device-owner + app como HOME

Las **TVs ya son device-owner** (verificado: `com.simuladorvr.tablet/.AdminReceiver, DeviceOwner`). Las **tablets hay que dejarlas igual**, para que arranquen solas y, si la app se cierra, Android la reabra (no se caigan al launcher).

Con la tablet **recién reseteada / sin cuenta agregada** (device-owner exige que no haya cuentas):

```bash
adb -s <serial> shell dpm set-device-owner com.simuladorvr.tablet/.AdminReceiver
```

Verificar en cualquier equipo:

```bash
adb -s <serial> shell dpm list-owners
# esperado: com.simuladorvr.tablet/.AdminReceiver,DeviceOwner
```

### 4. Tablets: encender solas al volver la luz

Las tablets **no bootean al reconectar la energía** por defecto (por eso quedan apagadas tras un corte). Por cada tablet, una de estas:
- Activar en Ajustes la opción tipo **"encender al conectar el cargador" / "auto power on"** (según modelo).
- Si el modelo no la tiene: dejarlas **siempre enchufadas y sin apagar** (solo pantalla en reposo), en un enchufe que no corte la térmica.
- A futuro / escalable: usar tablets de kiosko que soporten boot-on-power.

## Dejar ADB accesible para rescate remoto

Hoy no se pudo setear el puerto ADB persistente desde shell (necesita root). Para poder rescatar remoto sin ir:

```bash
# habilitar ADB por WiFi (se pierde al reiniciar salvo que sea persistente)
adb -s <serial-USB> tcpip 5555
# en las TVs el puerto persiste; en las tablets NO (se re-habilita por USB o con root:
#   adb root && adb shell setprop persist.adb.tcp.port 5555   # solo si el equipo da root)
```

Además: la **tablet que corre Tailscale** (nodo de rescate remoto) debe quedar **siempre viva y con Tailscale corriendo**; si esa se cuelga, se pierde el acceso remoto a toda la flota (fue lo que pasó).

## Mapa de equipos (IPs LAN conocidas, red 192.168.100.x)

| Equipo | IP | Notas |
|---|---|---|
| TV Simulador 1 | 192.168.100.30 | device-owner OK |
| TV Simulador 2 | 192.168.100.28 | device-owner OK |
| TV Simulador 4 | 192.168.100.14 | device-owner OK |
| TV (¿Sim 3?) | 192.168.100.21 | ADB sin autorizar |
| TV Simulador 5 | (sin ADB) | fallaba DNS — poner DNS 8.8.8.8 |
| Tablets 1–5 | (pierden ADB al reiniciar) | instalar por USB |

## Verificación final (la prueba de fuego)

1. Con todo configurado, **cortá la térmica** (apagá todo: router incluido).
2. Esperá 1 min. **Volvé a dar la luz.**
3. Sin tocar nada, cronometrá: en ~2–4 min las 5 TVs deben mostrar "SIMULADOR N — DISPONIBLE" (punto verde) y las 5 tablets la pantalla de ingreso de código.
4. En el panel (Dashboard → Estado de dispositivos) los 10 deben decir **Online**.

Si algún equipo no levanta solo tras esta prueba, ese equipo no tiene alguna de las 4 piezas (revisá: app nueva instalada, DNS 8.8.8.8, device-owner, y —tablets— que haya encendido solo).
