# Plan de fixes Race Room — para subir (revisión total front + admin + backend + kiosko)

> Resultado de 4 auditorías (kiosko/seguridad, backend/pagos, admin, frontend). Nada aplicado todavía.
> **Tipo de cambio:** `WEB` = deploy Vercel (seguro, sin tocar equipos) · `NATIVE` = recompilar APK + reinstalar en las 5 TVs (ya autorizadas, `install -r` mantiene config) · `HW` = hardware en el local.

---

## 🔴 P0 — CRÍTICO (juego gratis + plata)

### 0.1 · Juego gratis: la consola nunca se "cierra" `HW` + `NATIVE` + `WEB`
La Play está **siempre encendida** en HDMI; la app solo cambia la *entrada* de la TV. Sin turno, el botón **Fuente del control** o el escape **Atrás×5** dan juego gratis. El software solo NO alcanza (el control físico lo maneja el TV).
- **HW (la cura real):** relé/smart-plug en la energía de la consola gobernado por el estado de sesión (encender en `switchToHdmi1`, apagar en idle) **o** CEC standby. + **modo comercial/hotel del TV** para deshabilitar el botón Fuente. + **esconder los controles** de las TVs.
- **NATIVE (mitigación):** watchdog de kiosko **permanente** (hoy solo corre 25s, `MainActivity.java:190,214`); re-afirmar la app cuando no hay sesión; **esconder/PIN el Atrás×5** (`MainActivity.java:296-320`); blindar `exitKiosk()` (`:662-679`).
- **WEB (mitigación):** en `app/tv/[puestoId]/page.tsx` rama idle (`:190-193`), llamar `switchToApp` si no hay sesión.

### 0.2 · Cancelar/Finalizar una sesión ACTIVA desde el admin NO corta la TV `NATIVE`
La tablet ya reacciona (fix reciente), pero la **TV congelada en HDMI no pollea** → sigue en la consola hasta el fin ORIGINAL. `app/tv/[puestoId]/page.tsx:146-159` programa la alarma al fin original; el PATCH admin solo cambia `status` (`app/api/admin/bookings/[id]/route.ts:163-168`).
- **Fix:** usar el **heartbeat nativo** (que sigue vivo en HDMI, `page.tsx:214-224`): que la respuesta de `/api/devices/heartbeat` devuelva "no hay sesión ACTIVE → volvé"; el hilo nativo hace `cancelScheduledReturn` + `switchToApp`. (Mismo canal que sirve para 0.1.)

### 0.3 · Doble sesión ACTIVA en un puesto (pay-and-collide) `WEB`
El webhook `direct-` (`app/api/webhooks/mercadopago/route.ts:114-127`) y el cron (`expire-bookings/route.ts:77-90`) activan una compra directa **sin lock ni chequeo de colisión**. Minutos después del pago, el puesto puede estar ocupado → dos sesiones vivas o pisar la próxima reserva.
- **Fix:** envolver la activación en `withPuestoLock` + re-chequear `ACTIVE` existente + `isSlotAvailable`; si está ocupado, dejar PENDING para reembolso (patrón de `tablet/activate/route.ts:105-120`).

### 0.4 · Webhook no idempotente → el código se pisa → "Código inválido" `WEB`
MP entrega el pago 2+ veces casi simultáneo; el guard `status !== "PENDING"` y el update no están en la misma transacción (`webhooks/mercadopago/route.ts:255-277`). Dos invocaciones generan **códigos distintos**; el del email queda pisado.
- **Fix:** update condicional atómico `updateMany({ where:{ id, status:"PENDING" }, data:{...} })` y generar código/mandar email solo si `count===1`. Mismo patrón en verify-payment y cron. La rama de grupo (`:172-209`) tiene la misma forma no atómica.

---

## 🟠 P1 — ALTO (plata + seguridad + feedback)

### 1.1 · OPERATOR puede reembolsar y mutar reservas `WEB`
Refund (`admin/bookings/[id]/refund/route.ts:19`), cancelar/finalizar/confirmar (`[id]/route.ts:25,48`), walk-in y grupo solo validan sesión, no rol. Reembolsos reales de MP al alcance de cualquier logueado.
- **Fix:** exigir `role === "ADMIN"` (o capability) en refund y transiciones destructivas de reservas pagadas.

### 1.2 · Cancelar (X) una reserva PAGADA deja el pago `approved` → sigue como ingreso `WEB`
El PATCH a CANCELLED no toca el `Payment` (`admin/bookings/[id]/route.ts:163-168`). Métricas suman solo `approved` → la plata queda contada. Aplica a walk-in, online pagado y ACTIVE.
- **Fix:** al cancelar con pago approved, forzar el flujo de reembolso o marcar el pago anulado.

### 1.3 · `POST /api/tablet/finish` sin auth + `bookingId` público → griefing `WEB`
Cualquiera en la red puede terminar la sesión paga de otro (`tablet/finish/route.ts:24-39`; status expone `bookingId` `[puestoId]/status/route.ts:85`). `direct-cancel` (sin auth) y `extend` (sin rate limit) igual.
- **Fix:** token de kiosko en finish/direct-cancel; rate limit en extend; no exponer `bookingId` crudo en el status.

### 1.4 · `handleAction` del admin falla en silencio `WEB`
`admin/reservas/page.tsx:788-797` no chequea `res.ok`. "Iniciar sesión" (individual) siempre da 400 a propósito → el botón no hace nada sin avisar. Y cualquier acción que falle no muestra error.
- **Fix:** chequear `res.ok` + toast con `data.error`; quitar/deshabilitar "Iniciar sesión" en individuales. (El `startNow` del grupo tampoco chequea, `:627-640`.)

### 1.5 · Reserva acepta `startTime` arbitrario (pasado / fuera de horario) `WEB`
`lib/validations/booking.ts:5` solo pide datetime. `bookings/route.ts` no valida horario; `isSlotAvailable` solo chequea solape. Se puede pagar un turno a las 3 AM o pasado. Igual en manual/group.
- **Fix:** validar futuro + alineado a `slotInterval` + dentro de `openHour..closeHour` (ya existe en `bookings/[id]/reschedule/route.ts:56-68`, reusar).

### 1.6 · Extensión pisa la próxima reserva + doble-extensión `WEB`
El `ext-` webhook (`webhooks/mercadopago/route.ts:150-162`) suma minutos sin chequear colisión; y la idempotencia por `paymentId` (que se sobreescribe) permite aplicar una extensión reenviada dos veces (`:146-148`).
- **Fix:** chequear `isSlotAvailable` antes de extender; llevar registro idempotente por `mpPaymentId`.

### 1.7 · Admin manual/grupo sin lock (TOCTOU) `WEB`
`admin/bookings/manual/route.ts:52-105` y `group/route.ts:49-101` chequean disponibilidad y crean en pasos separados, sin `withPuestoLock` → dos operadores (o operador + web) pueden doble-bookear.
- **Fix:** check + create dentro de `withPuestoLock`.

---

## 🟡 P2 — MEDIO (UX / robustez / consistencia)

- **2.1 · Zona horaria en la web** `WEB`: `fmt()` (`reserva/page.tsx:37`) y confirmación (`confirmacion/page.tsx:300`) no fuerzan TZ AR → el cliente ve otra hora que el email. **Fix:** `timeZone: "America/Argentina/Buenos_Aires"` en todos los formatters del cliente. *(Importante: no-shows por hora equivocada.)*
- **2.2 · Fecha por defecto corrida a la tarde** `WEB`: `reserva/page.tsx:104-108` mezcla local y UTC. **Fix:** calcular "hoy en AR" como el backend (`availability.ts:208`).
- **2.3 · Selectores de kiosko sin salida si `/api/puestos` falla o localStorage viejo** `WEB`: `tv/page.tsx` / `tablet/page.tsx` quedan sin botones ni retry; id borrado redirige a sub-página rota. **Fix:** estado de error + retry; limpiar localStorage si el id no está en la lista activa; try/catch en localStorage.
- **2.4 · `/api/puestos` falla → precios en 0 pero checkout habilitado** `WEB` (`reserva/page.tsx:128`): el cliente paga sin ver total. **Fix:** error/retry y bloquear checkout si no hay precios.
- **2.5 · PENDING propio bloquea re-selección 30 min + grilla stale tras 409** `WEB`: **Fix:** bajar TTL de PENDING online (10-15 min) y/o no bloquear al cliente por su propio PENDING; re-fetch de disponibilidad tras 409.
- **2.6 · Confirmación de grupo sin verify-payment** `WEB` (`confirmacion/page.tsx:116`): el grupo depende solo del webhook → "procesando" más largo. **Fix:** endpoint `group/[groupId]/verify-payment` + llamarlo.
- **2.7 · Doble-click "Ir a pagar"** `WEB`: no duplica (lock en DB) pero flashea error. **Fix:** `submittingRef` sincrónico.
- **2.8 · Underpaid no chequeado si falta `transaction_amount`** `WEB` (`webhooks/…:105,181,250` y cron `:77-108`): confirma sin verificar monto. **Fix:** tratar 0/faltante como "no verificable" → no confirmar.
- **2.9 · Webhook de grupo pisa `groupCode` de miembros ya PAID** `WEB` (`webhooks/…:197-208`): **Fix:** actualizar solo los `PENDING` (como el cron `:178`).
- **2.10 · Falta alerta de TV offline / fuera de la app** `WEB`+`admin` (ligado al juego gratis): el dashboard muestra estado pero no alerta proactiva; un silencio prolongado **sin sesión** debería alertar (`admin/devices/route.ts:37-49`). **Fix:** alerta cuando una TV está en silencio > N min en horario sin sesión.
- **2.11 · Preview de descuento de grupo roto para OPERATOR** `WEB` (`reservas/page.tsx:579` pega a settings ADMIN-only → 403 → muestra sin descuento). **Fix:** lectura pública de la config de descuento (ya existe `/api/group-discount`, usarla).
- **2.12 · `/api/devices/heartbeat` sin auth** `WEB`: se puede spoofear "online". **Fix:** firmar el beat.
- **2.13 · Walk-in sin monto editable ni medio de pago** `WEB` (`manual/route.ts:60-104`): métricas sesgadas. **Fix:** permitir override de monto + medio (efectivo/tarjeta/transferencia); contemplar 90 min.
- **2.14 · Confirmación: sin estado terminal para EXPIRED + "Revisar de nuevo" no re-arma timeout** `WEB` (`confirmacion/page.tsx:171,410`). **Fix:** estado "reserva no completada" con CTA; re-armar timeout.
- **2.15 · Accesibilidad de la grilla** `WEB`: celdas sin `aria-label` (hora+simulador+estado); contraste bajo en deshabilitadas.

---

## Orden sugerido para mañana

1. **HW primero (lo que frena la sangría):** relé/CEC en la consola + esconder controles + modo comercial del TV. Es lo único que **realmente** cierra el juego gratis.
2. **NATIVE (una sola recompilada + reinstalar en las 5 TVs):** 0.2 (cancelar/finalizar corta la TV), watchdog permanente + re-afirmar app idle + esconder Atrás×5 (0.1 software). Todo junto en un APK.
3. **WEB tanda 1 (crítico plata):** 0.3, 0.4, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7.
4. **WEB tanda 2 (UX/robustez):** todos los P2.
5. **Cerrar tablets** (app nueva por USB) y **prueba de corte de luz**.

Las tandas WEB son deploys de Vercel, no tocan los equipos → se pueden subir sin riesgo y probar. Lo NATIVE y HW requieren estar en el local.
