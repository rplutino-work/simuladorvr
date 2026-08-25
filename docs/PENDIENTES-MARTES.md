# Pendientes para el martes (presencial, por ADB)

> Actualizado tras el deploy de hoy. Lo de la web ya salió y se propaga solo;
> esto es lo que **requiere estar en el local** con las TVs/tablets a mano.

## 🔴 Prioridad 1 — que no vuelva a fallar lo de hoy

### 1. Overlay "últimos minutos" en las TV (hoy solo anduvo la TV 5)
El permiso de dibujar-encima se resetea con cada reboot. En **TV 1, 2, 3 y 4**:
```
adb -s <ip>:5555 shell appops set com.simuladorvr.tablet SYSTEM_ALERT_WINDOW allow
```
- Después reiniciar la app (o la TV) para que el banner nativo tome el permiso.
- Verificar con una prueba: turno corto → tiene que aparecer el cartel de tiempo.
- **Fix definitivo (ver punto 7):** rebuild que se auto-otorgue el permiso al arrancar, así sobrevive reboots y no hay que tocarlo nunca más.

### 2. Tablets con "err name not resolved" (DNS)
Setear Private DNS en las **5 tablets** para que no dependa del DNS del router:
- Ajustes → Red e Internet → DNS privado → Nombre de host: `dns.google`
- Por ADB (si el kiosco deja): 
```
adb -s <ip>:5555 shell settings put global private_dns_mode hostname
adb -s <ip>:5555 shell settings put global private_dns_specifier dns.google
```
- Confirmar que cada tablet abre `raceroom.com.ar` sin la pantalla de error de Chrome.
- **Mejor aún (punto 7):** rebuild con pantalla propia "Reconectando…" + reintento, en vez de la pantalla fea de error del navegador.

### 3. Cada tablet en su puesto correcto
Los taps de selección de puesto quedaron **a ciegas** (sin confirmar). Verificar una por una y sacar screenshot:
```
adb -s <ip>:5555 shell dumpsys window | grep -i mCurrentFocus   # o screencap
```
Que la tablet N esté en el puesto N.

## 🟡 Prioridad 2 — confirmar lo desplegado

### 4. Pantalla de las TV (deploy de hoy)
En reposo, las 5 TV tienen que mostrar:
- Logo **centrado y completo** (ya no cortado arriba).
- "Cómo empezar" (3 pasos) **como texto abajo-izquierda**.
- Nota de 🎧 auriculares **abajo-derecha**.
Si alguna sigue mostrando lo viejo → estaba sin internet; con red OK se recarga sola en ≤20 s estando en reposo.

### 5. Warning reforzado en tablets (deploy de hoy)
Con un turno llegando a <5 min: flash rojo full-screen titilando, borde grueso, reloj pulsando. En el **último minuto** todo va más rápido y dice "¡ÚLTIMO MINUTO!". Se agarra solo por web, no hace falta reinstalar.

## 🟢 Prioridad 3 — hardware / robustez

### 6. Carga de tablets
Tablets **3, 4 y 5** se descargan: el USB de la TV no da corriente suficiente.
- Llevar cargadores de pared **5V / 2A**.
- Dejar el router 24/7 (evita el baile de DNS y que las TV no levanten).

### 7. (Opcional pero recomendado) Rebuild del APK
Un solo build de tablet + uno de TV que resuelva de raíz:
- **Overlay auto-otorgado** al arrancar (adiós al punto 1 para siempre).
- **Pantalla propia de "sin conexión / reconectando"** con reintento (adiós a la pantalla de error de Chrome del punto 2).
- Instalar con `install -r` (mantiene datos/localStorage y el puesto seleccionado).
> Si querés, dejo este código listo antes del martes así solo es build + `install -r` en las 10.

---
### Recordatorio de acceso
- TVs: `tcpip 5555` persiste el reboot → conectás directo por IP.
- Tablets: **NO** persisten el `tcpip 5555` → re-autorizar por USB al llegar.
- Paquete (TV y tablet): `com.simuladorvr.tablet`.
