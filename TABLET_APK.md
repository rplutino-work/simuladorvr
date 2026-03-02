# Guía para generar el APK de la tablet

## ¿Cómo funciona la app de tablet?

La app es una **WebView nativa Android** que abre directamente `https://simuladorvr.vercel.app`.
No requiere recompilar para actualizar — cualquier cambio en Vercel se refleja automáticamente en la tablet al abrir la app.

Cada simulador tiene su propia URL:
- Simulador 1: `https://simuladorvr.vercel.app/tablet/{puestoId}`
- Simulador 2: `https://simuladorvr.vercel.app/tablet/{puestoId}`
- etc.

> El `puestoId` lo obtenés desde el admin panel → Puestos → ID del simulador.

---

## Requisitos previos

1. **Java JDK 17** — https://adoptium.net
2. **Android Studio** — https://developer.android.com/studio
3. **Android SDK** — se instala con Android Studio (API Level 33+)
4. **Node.js** ya instalado en este proyecto

---

## Paso 1: Inicializar el proyecto Android

```bash
# Desde la raíz del proyecto:
npx cap init
# Si te pregunta, responde:
#   App name: SimuladorVR
#   App ID: com.simuladorvr.tablet

# Agregar plataforma Android
npx cap add android
```

---

## Paso 2: Configurar la URL del simulador

Editar `android/app/src/main/assets/capacitor.config.json` y verificar que contenga:
```json
{
  "appId": "com.simuladorvr.tablet",
  "appName": "SimuladorVR",
  "webDir": "public",
  "server": {
    "url": "https://simuladorvr.vercel.app",
    "cleartext": false,
    "androidScheme": "https"
  }
}
```

Si querés que la tablet **abra directamente en un puesto específico**, cambiá la URL:
```json
"url": "https://simuladorvr.vercel.app/tablet/PUESTO_ID_AQUI"
```

---

## Paso 3: Configurar pantalla completa (fullscreen/kiosk)

Para que la app arranque en pantalla completa y oculte la barra de estado, editá:
`android/app/src/main/java/com/simuladorvr/tablet/MainActivity.java`

```java
@Override
protected void onStart() {
    super.onStart();
    View decorView = getWindow().getDecorView();
    decorView.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_FULLSCREEN
    );
}
```

---

## Paso 4: Sincronizar y abrir en Android Studio

```bash
# Desde la raíz del proyecto:
npx cap sync android
npx cap open android
```

---

## Paso 5: Generar el APK firmado

En Android Studio:
1. **Build** → **Generate Signed Bundle / APK**
2. Elegí **APK**
3. Creá un keystore nuevo (guardalo en lugar seguro)
4. Build type: **release**
5. El APK se genera en `android/app/release/app-release.apk`

---

## Paso 6: Instalar en la tablet

```bash
# Con la tablet conectada por USB y depuración activada:
adb install android/app/release/app-release.apk

# O copiá el APK a la tablet y abrilo desde el explorador de archivos
```

---

## Modo Kiosk (opcional, para producción)

Para que la tablet solo pueda abrir esta app:
1. Ir a **Ajustes → Accesibilidad → Acceso guiado** (o usar Android Device Policy)
2. O usar **ADB Device Owner** para modo kiosk completo

---

## Actualización de la app

Como la app apunta a la URL de Vercel, **no necesitás recompilar** para actualizar la UI.
Solo deployá en Vercel y la tablet verá los cambios al siguiente reinicio de la app.
