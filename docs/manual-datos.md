# Datos verificados para el manual — Race Room

> Todo lo de abajo fue **verificado contra el código real** del repo `simuladorvr` (Next.js + Prisma + Neon + MercadoPago + Resend, kioscos Android/Capacitor). Cada dato lleva su referencia `archivo:línea`. Lo que no existe está marcado como **NO EXISTE**. Al final está la lista de **"lo que el manual dice mal"** (supuestos que en el código funcionan distinto) y los **datos de negocio** que aportó el dueño.

---

## 1. Acceso, usuarios y roles

- **1.1 Login y redirección:** URL `/admin/login` (`lib/auth.ts:67`, `app/admin/login/page.tsx`). El guard vive en `middleware.ts:144-154`: cualquier `/admin` sin token redirige a `/admin/login?callbackUrl=…`. Tras entrar va al `callbackUrl` (default **`/admin` = Dashboard**, `app/admin/login/page.tsx:16,37`).
- **1.2 Roles:** enum `UserRole { ADMIN OPERATOR }` (`prisma/schema.prisma:28-31`), default `OPERATOR` (`:21`). Nombres visibles: **"Administrador"** / **"Operador"** (`app/admin/layout.tsx:136`). NO hay tercer rol.
- **1.3 Matriz de permisos:** ver tabla dedicada más abajo. **Clave:** solo `puestos`, `settings` y `email-test` validan rol ADMIN en el backend; todo el resto de `/api/admin/**` solo exige sesión iniciada (no distingue rol).
- **1.4 Alta de usuarios / reset de contraseña:** **NO EXISTE** pantalla de usuarios ni endpoint de registro ni recuperación de contraseña. Los usuarios se crean por seed/DB (`prisma/seed.ts:8-27`, hash bcrypt). Semilla: `admin@simuladorvr.com` / `admin123` (ADMIN) y `operador@simuladorvr.com` / `operador123` (OPERATOR) — *credenciales por defecto del seed; en producción están cambiadas.*
- **1.5 Duración de sesión:** **24 horas** (`lib/auth.ts:62-64`, JWT `maxAge: 24*60*60`).

## 2. Estructura del panel

- **2.1 Rutas y menú** (`app/admin/layout.tsx:28-44`):
  - Grupo **"General":** "Dashboard" → `/admin` · "Reservas" → `/admin/reservas` · "Métricas" → `/admin/metricas`
  - Grupo **"Gestión"** (ítems `adminOnly`, ocultos al operador): "Simuladores" → `/admin/puestos` · "Configuración" → `/admin/configuracion`
- **2.2 Dashboard** (`app/admin/page.tsx`, datos de `app/api/metrics/route.ts`, cortes en hora AR UTC-3):
  - KPIs: **"Reservas activas"** (ACTIVE ahora), **"Ingresos hoy"** (pagos approved del día, trend "vs ayer"), **"Ingresos del mes"** (acumulado), **"Reservas hoy"** (pagos del día, "vs ayer").
  - Gráficos: **"Ingresos — últimos 14 días"** (área) · **"Uso por simulador"** (barras, histórico, estados PAID/ACTIVE/FINISHED) · **"Duración elegida"** (dona) · **"Estado de reservas"** (dona, all-time) · **"Actividad por hora"** (últimos 30 días).
  - La pantalla **Métricas** reusa el mismo `/api/metrics`.
- **2.3 Estado de dispositivos (solo Dashboard):** panel **"Estado de dispositivos"** / "Tablets y TVs por puesto — en vivo" (`app/admin/page.tsx:123`). Heartbeat del kiosko **cada 15 s** (`app/tablet/[puestoId]/page.tsx:222`, `app/tv/[puestoId]/page.tsx:217`), el panel refresca **cada 5 s**, umbral **offline = 45 s** (`app/admin/page.tsx:32`). Estados/colores: **"Online"** (verde), **"Offline"** (rojo), **"Sin señal"** (gris, nunca reportó), **"En sesión"** (ámbar, caso especial de la TV cuando está en HDMI de la PlayStation).

## 3. Pantalla de Reservas (`app/admin/reservas/page.tsx`)

- **3.1 Columnas (desktop, en orden):** "Código", "Simulador", "Cliente", "Inicio", "Dur. / $", "Estado", "Acciones" (`:1044-1052`). En mobile son tarjetas.
- **3.2 Filtros:** buscador único de texto (placeholder **"Código, nombre o email…"**, `:812`) que busca en `code/customerName/customerEmail/id` (`app/api/admin/bookings/route.ts:40-45`) + filtro por estado (select "Todos los estados" + 6 estados) + tarjetas-resumen clicables. **Filtro por fecha: NO EXISTE. Filtro por puesto: NO EXISTE en la UI** (el backend soporta `?puestoId=` pero la pantalla no lo usa).
- **3.3 Estados:** ver tabla dedicada más abajo.
- **3.4 Botones (texto literal):** header → **"Grupo"** (`:834`), **"Walk-in / Efectivo"** / "Walk-in" (`:839`). Fila → "Confirmar pago", "Iniciar sesión", "Finalizar", "Cancelar", "Ver detalle", "Nota". Detalle → "Reembolsar y cancelar", "Confirmar reembolso", "Guardar notas".
- **3.5 Editar/reprogramar:** desde el panel **solo se cancela y se recrea**; se pueden editar notas/nombre/email (`PATCH /api/admin/bookings/[id]`) pero NO fecha/hora. La reprogramación real (`app/api/bookings/[id]/reschedule`) es **self-service del cliente** con su token, no del panel.
- **3.6 Código y reenvío:** el código **se muestra** (columna + detalle, con copiar). **Reenviar email: NO EXISTE botón** (el email solo se manda automáticamente al confirmar un PENDING sin código).

## 4. Walk-in (`WalkInModal`, `app/api/admin/bookings/manual/route.ts`)

- **4.1 Botón:** **"Walk-in / Efectivo"**. Modal titulado **"Reserva manual (walk-in)"** / "Pago en efectivo — se genera código de inmediato".
- **4.2 Campos:** Simulador (obligatorio, default primer puesto), Duración (30/60/120, default 60), Precio (solo display), Fecha (obligatoria, default hoy), Hora (obligatoria, default "10:00", pasos 15'), Nombre (opcional), Email (opcional), Notas (opcional), checkbox **"Enviar email de confirmación al cliente"** (default off, solo si hay email).
- **4.3 Cobro efectivo:** queda **PAID** al instante (`manual/route.ts:84`), crea `Payment` con `mpPaymentId: "manual-…"` (para métricas). **No se elige monto** (toma el del puesto/duración; si es 0 rechaza) ni **medio de pago** (se asume efectivo; el detalle lo muestra como "Efectivo / manual").
- **4.4 Código/email:** genera código siempre; email solo si se tildó el checkbox Y hay email. Sin email → reserva creada igual, sin correo (no hay fallback).
- **4.5 "Ahora mismo":** se puede crear con hora = ahora pero **no arranca solo**; la sesión corre cuando se ingresa el código en la tablet (recalcula el `endTime` desde ese momento). Arranque simultáneo solo existe para **grupos** ("Iniciar grupo ahora").

## 5. Grupos

- **5.1 Modelo:** NO hay tabla `Group`. Un grupo = varias `Booking` con el **mismo `groupId`** (UUID) y **`groupCode`** compartido (`prisma/schema.prisma:136-137`, índices `:152-153`). Cada puesto es una reserva separada.
- **5.2 Carga en el panel:** botón **"Grupo"** → `GroupModal` titulado **"Reserva grupal"** / "Varios puestos, mismo horario, con descuento por grupo". Elegís 2+ puestos (label "Puestos (elegí 2 o más)"), duración, fecha, hora, nombre opcional; botón **"Crear grupo · $…"**. Crea N reservas PAID en una transacción (`app/api/admin/bookings/group/route.ts`).
- **5.3 Iniciar grupo:** existe **"Iniciar grupo ahora"** (`page.tsx:666`) → `PATCH …/group {action:"start"}` pone **todas** en ACTIVE de una (`group/route.ts:136-145`). También soporta `finish` y `cancel` del grupo entero.
- **5.4 Código del grupo:** **UNO SOLO compartido** (`groupCode`), las reservas de grupo tienen `code = null`. **✅ Desde el deploy 2026-08-04, la tablet acepta el `groupCode`**: `/api/tablet/activate` matchea por `code` **o** `groupCode` para ese puesto, así que cada integrante entra a su tablet, ingresa el código compartido y arranca su simulador (igual que una reserva individual). Alternativa: iniciar todo el grupo de una desde el panel ("Iniciar grupo ahora").
- **5.5 Cancelar un puesto del grupo:** **NO se recalcula** el descuento ni cambia el `groupCode`; los otros conservan su precio congelado. Solo `action:"cancel"` cancela el grupo entero.
- **5.6 Duraciones:** **todas iguales** (una sola duración para todo el grupo).

## 6. Descuento por grupo

- **6.1 Config:** tabla `BusinessSettings`, campos `groupDiscountEnabled/Tiers/From/To` (`schema.prisma:53-56`). **Editable desde el panel** (Configuración → "Descuentos por grupo"). No hardcodeado (salvo el default de fallback).
- **6.2 Tramos/defaults:** 2/3/4/5 puestos; `DEFAULT_GROUP_TIERS = {2:5, 3:10, 4:15, 5:20}` (`lib/group-discount.ts:10`). Para 6+ toma el tramo definido más alto ≤ cantidad.
- **6.3 Duración/redondeo:** aplica igual a todas las duraciones; `discountedTotal = round(baseTotal*(1-pct/100))` — **redondeo al centavo** (precios en centavos), remanente a la primera reserva.
- **6.4 Fechas from/to:** vacías = siempre; `from` se guarda a las 00:00 y `to` a las 23:59. Fuera del rango → 0%.
- **6.5 ¿Aplica al panel?** Sí, walk-in de grupo usa el mismo cálculo; se crea como PAID/efectivo.
- **6.6 Desactivado:** no se muestra el aviso "¿Vienen en grupo?" ni el desglose; el cliente puede reservar 2+ pero paga total sin descuento.

## 7. Código de acceso (`lib/code-generator.ts`)

- **7.1 Formato:** **4 caracteres**, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin O, 0, I, 1), CSPRNG. *(El comentario del schema dice "6-digit" pero está obsoleto — el real es 4.)*
- **7.2 Cuándo se genera:** **al confirmar el pago** (webhook / verify / cron), no al crear. Walk-in y grupo del panel nacen PAID con código.
- **7.3 Validez:** **no vence por tiempo** — no hay ventana "X min antes / gracia". Un código PAID se canjea cuando el puesto esté libre y no se superponga con la próxima reserva. La sesión ya iniciada se auto-cierra 5 min después de su fin.
- **7.4 Reuso:** una sesión por código; reingresar mientras está ACTIVE **retoma** la sesión (`resumed:true`), no reinicia. FINISHED ya no sirve.
- **7.5 Errores en la tablet:** ver lista de textos literales abajo.
- **7.6 Límite de intentos:** **15 cada 5 min por IP+puesto** (429), ventana deslizante, sin bloqueo permanente.
- **7.7 Unicidad:** `code` individual **único para siempre** (`@unique`). `groupCode` **NO** es único para siempre (reusable una vez que el grupo quedó FINISHED/CANCELLED/EXPIRED).

## 8. Tablets, TVs y sesiones

- **8.1 App:** **WebView nativa Android (Capacitor)** que abre la web de Vercel (`capacitor.config.ts`, `TABLET_APK.md`). Dos APKs (tablet y TV). También corre como PWA. Modo kiosko: parte nativa en el repo (`MainActivity.java` immersive + lock-task/Device Owner + BootReceiver), pero la **habilitación efectiva (Device Owner/MDM) es config del dispositivo, fuera del repo**.
- **8.2 Vínculo tablet→puesto:** por **URL** (`/tablet/{id}` o `/tablet/1`) y/o **localStorage** ("Esta selección se recuerda automáticamente"). NO hay login/QR/pairing. El `puestoId` se saca de Admin → Simuladores.
- **8.3 Pantallas (texto literal):** reposo → "🏁 Jugar ahora", "Ya tengo código"; ingreso → "INGRESÁ TU CÓDIGO", "Iniciar sesión →"; validando → "VALIDANDO..."; sesión activa → "TIEMPO RESTANTE", "+TIEMPO", "FINALIZAR", warning "⚠️ ¡ÚLTIMOS MINUTOS!"; fin → "🏁 ¡SESIÓN FINALIZADA!", "GRACIAS, {nombre}", vuelve al reposo en 8 s. (Fuente `app/tablet/[puestoId]/page.tsx`.)
- **8.4 Encendido de pantalla:** la tablet marca la reserva ACTIVE en la DB; la **TV** hace polling cada 3 s a `/api/tablet/{id}/status`, muestra "PREPARANDO TU SESIÓN" y llama al puente nativo `switchToHdmi1()` que cambia la TV a la entrada HDMI de la PlayStation (específico TCL/MediaTek). Existe alternativa por ADB (`local-controller/index.js`).
- **8.5 Cierre de sesión:** al llegar a 0 la tablet llama `/api/tablet/finish` → FINISHED. Red de seguridad: cron cada 5 min cierra ACTIVE vencidas con **5 min de gracia**. La TV vuelve a la app con alarma nativa aunque el WebView esté congelado.
- **8.6 Corte de internet:** la tablet **sigue contando localmente**; la TV mantiene estado; el retorno del HDMI está garantizado por alarma nativa; al volver, el cron cierra lo que quedó colgado.
- **8.7 Reinicio fuera de la app:** apagar/prender la devuelve sola (`BootReceiver` relanza 10 s post-boot). La receta de re-vinculación por ADB/Device Owner **no está en el repo** (runbook de flota).
- **8.8 Desactivar puesto con sesión activa:** la sesión en curso **NO se corta** (status fuerza `screenOn:true` si hay sesión). Bloquea nuevos inicios; al terminar, la TV se apaga (pantalla negra).

## 8B. Compra directa en la tablet — "Jugar ahora" (SIN reserva ni código)

> Flujo omitido en el manual v3.0. **Sí existe**: un cliente puede pagar y jugar en el momento desde la propia tablet, sin reserva previa y sin ingresar código. Endpoints: `app/api/tablet/[puestoId]/direct-options/route.ts`, `.../direct-purchase/route.ts`, y la rama `direct-` del webhook (`app/api/webhooks/mercadopago/route.ts:91-128`).

- **Cómo funciona:** reposo de la tablet → botón **"🏁 Jugar ahora"** → elegir duración (30/60/120) → la tablet muestra un **QR de MercadoPago** ("ESCANEÁ PARA PAGAR") → el cliente escanea con su celular y paga → al aprobarse, la sesión **se activa sola** (la TV cambia a la consola). **No se ingresa código.**
- **Tiempo real / precio proporcional:** calcula los minutos disponibles hasta la próxima reserva o el cierre y cobra proporcional, **redondeando hacia arriba a $10** para no cobrar de menos (`direct-options/route.ts:107-176`). Si el faltante es ≤15 min ofrece la duración como **"Parcial"**; si es mayor, ofrece una menor. Mínimo usable 10 min.
- **Seguridad:** el precio se recalcula en el servidor (no se puede falsear desde la tablet, `direct-purchase/route.ts:83-85`). Rate limit **15/5min por IP+puesto**. Se crea bajo lock por puesto (dos personas no compran el mismo a la vez).
- **La reserva directa** nace PENDING arrancando "ahora" y pasa a ACTIVE al pagar; **no genera código** (no lo necesita). No lleva email.
- **Fuera de horario / puesto inactivo / sin precio** → no ofrece la opción ("Fuera de horario" / "Puesto no disponible").
- **Extensión de sesión ("+TIEMPO"):** desde la sesión activa el cliente elige +30/+60/+120 y paga por otro QR; se extiende sola al confirmarse (`external_reference` = `ext-{bookingId}-{min}`).

## 9. Disponibilidad y horarios (`lib/availability.ts`)

- **9.1 Generación:** slots desde `openHour` a `closeHour` cada `slotInterval` min (defaults 10 / 20 / 15). Un slot está libre si no se superpone con reservas PENDING/PAID/ACTIVE (con buffer `negativeMarginMinutes`) y si la duración entra antes del cierre.
- **9.2 Reservas sin pagar:** **sí bloquean** (PENDING cuenta como ocupado). Expiran a los **30 min** exactos; las libera el **cron** (cada 5 min), no "al consultar".
- **9.3 Zona horaria:** **Argentina UTC-3 fijo** (`AR_TZ_OFFSET_HOURS = 3`), sin horario de verano.
- **9.4 Bloquear días/franjas (feriados/evento/mantenimiento):** **NO EXISTE**. Solo el rango diario y desactivar un puesto entero.
- **9.5 120 min en la web:** **sí** (`DURATIONS = [30, 60, 120]`). Requiere `price120 > 0`.
- **9.6 Anticipación máxima:** **NO EXISTE tope**. La web pre-selecciona mañana si ya son ≥20 h.

## 10. Precios

- **10.1 Dónde viven:** en `Puesto` (por puesto y duración), campos `price30/60/90/120` **en centavos** (`schema.prisma:71-75`). Hoy todos los puestos tienen el mismo precio. *(El flujo online usa 30/60/120; `price90` existe en DB pero ese endpoint no lo consume.)*
- **10.2 Precios reales (leídos de la DB):**

| Puesto | 30 min | 60 min | 90 min | 120 min | Activo |
|---|---|---|---|---|---|
| Simulador 1 | $6.000 | $10.000 | $15.000 | $20.000 | Sí |
| Simulador 2 | $6.000 | $10.000 | $15.000 | $20.000 | Sí |
| Simulador 3 | $6.000 | $10.000 | $15.000 | $20.000 | Sí |
| Simulador 4 | $6.000 | $10.000 | $15.000 | $20.000 | Sí |
| Simulador 5 | $6.000 | $10.000 | $15.000 | $20.000 | Sí |

- **10.3 Precios por día/horario (happy hour):** **NO EXISTE**. Lo único variable es el descuento por grupo.
- **10.4 Cambiar un precio:** el precio se **congela** en la reserva al crearla (`Booking.price`). Cambiarlo **no afecta** reservas existentes ni pagadas; solo futuras.
- **10.5 Promo inauguración:** no es un precio hardcodeado; es el descuento por grupo configurable (con ventana `from/to` opcional).

## 11. MercadoPago

- **11.1 Integración:** **Checkout Pro** vía `Preference` (redirección a `init_point`). Sin restricción de medios (quedan todos los de la cuenta). Moneda ARS.
- **11.2 Confirmación:** webhook + polling (`verify-payment`) + cron. "Pagado" = `status === "approved"`, con guardia de **pago insuficiente** (no activa si paga de menos). El webhook revalida contra MP con el access token.
- **11.3 Reconciliación:** cron `/api/cron/expire-bookings` cada 5 min (Vercel) + cada 10 min (GitHub Actions). Reconcilia PENDING de las últimas 3 h (individuales, directas y **grupos**), confirma y **manda el email**; expira PENDING >30 min; auto-finaliza ACTIVE vencidas.
- **11.4 Pago tras expirar:** **no revive** automáticamente CANCELLED/EXPIRED → pago huérfano → reembolso manual. (Si el pago llega entre 30 min y 3 h y aún está PENDING, sí se recupera.)
- **11.5 Reembolsos:** **desde el panel**, botón **"Reembolsar y cancelar"** → `POST /api/admin/bookings/[id]/refund` (llama a MP para pagos online; solo registra para efectivo). Lo puede usar **cualquier usuario logueado** (ADMIN u OPERATOR).
- **11.6 ID de pago:** en el detalle de la reserva, sección "Pago" → "ID MercadoPago" (`booking.payment.mpPaymentId`).

## 12. Emails

- **12.1 Servicio:** **Resend** (`lib/email.ts`). Remitente: `BusinessSettings.emailFrom` → env `EMAIL_FROM` → fallback `"Race Room <onboarding@resend.dev>"`. Interruptor global `emailEnabled`.
- **12.2 Emails que envía:** **UNO SOLO** — `sendBookingConfirmationEmail`, asunto **`✅ Reserva confirmada – Código {code}`**. Se dispara al pagar (individual, grupo, walk-in con checkbox, verify, cron). **NO EXISTEN** emails de recordatorio, cancelación ni reembolso.
- **12.3 Reenviar / fallidos:** **NO** hay botón de reenvío (solo el de "email de prueba" que manda `TEST01`). Los fallos solo se loguean (Vercel), no hay registro en DB.
- **12.4 Email mal escrito:** se puede **corregir** el email (`PATCH`), pero **no se reenvía** automáticamente si la reserva ya tiene código.

## 13. Configuración (`app/admin/configuracion/page.tsx`, zod en `app/api/admin/settings/route.ts`)

Ver tabla completa de campos abajo. Puntos clave:
- **13.2 Cierre ≤ apertura:** aviso en vivo **"La hora de cierre debe ser mayor a la de apertura."** y **rechazo del servidor** (HTTP 400, no se puede guardar un horario invertido).
- **13.3 Cancelaciones:** `allowCancel`, `cancelMode` (MANUAL/AUTOMATIC), `contactPhone`, `cancelLimitHours`. **MANUAL** = marca CANCELLED + WhatsApp (no devuelve plata); **AUTOMATIC** = además reembolsa por MP (efectivo siempre cae a MANUAL). El cliente cancela solo desde `/cancelar?token=…` (link en el email).
- **13.4 Interruptor de emails:** **global** (apaga todos los transaccionales; hoy solo existe la confirmación).
- **13.5 Cache:** settings TTL 30 s, puestos TTL 60 s, con `updateTag` al guardar → invalidación prácticamente inmediata.

## 14. Puestos

- **14.1 Cantidad:** no están fijos; hay UI **"Nuevo simulador"** → `POST /api/admin/puestos`. El seed crea 5 solo si la tabla está vacía.
- **14.2 Campo VR:** **NO EXISTE** en el modelo `Puesto`. No se puede saber por sistema cuáles tienen VR (dato manual del dueño: puestos **4 y 5**).
- **14.3 Nombres:** "Simulador 1"…"Simulador 5" (texto libre; fallback técnico "Puesto N" solo en la TV sin nombre).
- **14.4 Desactivar:** desaparece de la web pública y de la disponibilidad; sigue visible en el admin con badge "Inactivo"; reservas ya vendidas **no se tocan** (soft delete `active=false`, `onDelete: Restrict`) y se pueden seguir activando en la tablet.

## 15. Errores

- **15.1** Ver lista de textos literales abajo.
- **15.2 Página de estado / "sistema caído":** **NO EXISTE** health/status público. El único `/status` es por-puesto (para la TV).
- **15.3 Logs:** logger JSON a consola → **logs de Vercel** (Runtime Logs). Cron visible también en **GitHub Actions**. **No hay Sentry/Datadog** (solo un hook comentado).

## 16. Infraestructura

- **16.1 Hosting:** app en **Vercel**, base en **Neon Postgres** (us-east-1). Dominio de producción **raceroom.com.ar** (+ `.vercel.app`). Quién administra el registrador/DNS: no está en el repo (confirmar por fuera).
- **16.2 Backups:** **NO EXISTE en el repo**; dependen de Neon (PITR/branching), gestionado por fuera.
- **16.3 Tareas programadas:** un solo job (`/api/cron/expire-bookings`) con dos disparadores: **Vercel Cron `*/5`** + **GitHub Actions `*/10`**. Hace: (1) reconciliar pagos perdidos, (2) expirar PENDING >30 min, (3) auto-finalizar ACTIVE vencidas.
- **16.4 Encendido/apagado:** desde el software es **seguro apagar/reiniciar** — el sistema se auto-cura (sesiones se cierran solas, PENDING se liberan solas, pagos se reconcilian). No requiere apagado ordenado. El orden físico de equipos es hardware fuera del repo.

---

# Tabla — Estados de reserva

Enum `BookingStatus` (`prisma/schema.prisma:156-163`), etiquetas `STATUS_LABELS` (`app/admin/reservas/page.tsx:88-95`), colores `STATUS_COLOR` (`:97-104`).

| Técnico | En pantalla | Color | Acciones que habilita |
|---|---|---|---|
| `PENDING` | "Pendiente" | ámbar (`bg-amber-100 text-amber-800`) | Confirmar pago · Cancelar |
| `PAID` | "Pagado" | azul (`bg-blue-100 text-blue-800`) | Iniciar sesión* · Cancelar |
| `ACTIVE` | "En curso" | verde (`bg-green-100 text-green-800`) | Finalizar · Cancelar |
| `FINISHED` | "Finalizado" | gris (`bg-slate-100 text-slate-600`) | Solo Ver detalle |
| `EXPIRED` | "Expirado" | rojo (`bg-red-100 text-red-700`) | Solo Ver detalle |
| `CANCELLED` | "Cancelado" | rojo (`bg-red-100 text-red-700`) | Solo Ver detalle |

\* **"Iniciar sesión" en el panel para una reserva individual NO funciona** (el backend lo rechaza a propósito y el front no muestra el error). Las sesiones individuales arrancan **desde la tablet** con el código. Solo los **grupos** se inician desde el panel ("Iniciar grupo ahora").

---

# Tabla — Matriz de permisos por rol

Backend: **401** = solo exige sesión (ADMIN y OPERATOR pueden). **ADMIN-only** = 403 si no es ADMIN.

| Acción | Endpoint | Backend | ADMIN | OPERATOR |
|---|---|---|---|---|
| Ver reservas | `GET /api/admin/bookings` | solo sesión | ✅ | ✅ |
| Ver métricas / dashboard | `GET /api/metrics` | solo sesión | ✅ | ✅ |
| Crear walk-in | `POST /api/admin/bookings/manual` | solo sesión | ✅ | ✅ |
| Crear grupo | `POST /api/admin/bookings/group` | solo sesión | ✅ | ✅ |
| Confirmar pago | `PATCH …/bookings/[id]` | solo sesión | ✅ | ✅ |
| Finalizar sesión | `PATCH …/bookings/[id]` | solo sesión | ✅ | ✅ |
| Cancelar reserva | `PATCH …/bookings/[id]` | solo sesión | ✅ | ✅ |
| Reembolsar | `POST …/bookings/[id]/refund` | solo sesión | ✅ | ✅ |
| Iniciar grupo | `PATCH …/bookings/group` | solo sesión | ✅ | ✅ |
| Ver códigos de acceso | dentro de `GET …/bookings` | solo sesión | ✅ | ✅ |
| Cambiar precios | `PATCH /api/admin/puestos/[id]` | **ADMIN-only** | ✅ | ❌ (oculto + 403) |
| Activar/desactivar/crear puesto | `…/puestos` | **ADMIN-only** | ✅ | ❌ |
| Editar configuración | `PATCH /api/admin/settings` | **ADMIN-only** | ✅ | ❌ (oculto + 403) |
| Enviar email de prueba | `/api/admin/email-test` | **ADMIN-only** | ✅ | ❌ |

> **Ojo de seguridad:** un OPERATOR puede confirmar pagos, cancelar, reembolsar y crear reservas/grupos vía API aunque en la UI algunos botones no se destaquen. Solo precios/config/puestos están realmente restringidos a ADMIN.

---

# Tabla — Precios actuales

(Ver sección 10.2. Todos en pesos; guardados en centavos.)

| Duración | Precio (todos los puestos) |
|---|---|
| 30 min | $6.000 |
| 60 min | $10.000 |
| 90 min | $15.000 (existe en DB, no se vende online) |
| 120 min | $20.000 |
| Grupo 5 × 60 min (−20%) | $40.000 |

Descuento por grupo: 2 → 5% · 3 → 10% · 4 → 15% · 5 → 20%.

---

# Tabla — Campos de Configuración

| Panel | Etiqueta | Tipo | Default | Validación |
|---|---|---|---|---|
| Horario y turnos | "Hora de apertura" | number 0-23 | 10 | int 0-23 |
| Horario y turnos | "Hora de cierre" | number 0-24 | 20 | int 0-24 (debe ser > apertura) |
| Horario y turnos | "Intervalo de slot (min)" | number 5-60 | 15 | int 5-60 |
| Horario y turnos | "Permitir cancelación" | toggle | true | bool |
| Horario y turnos | "Permitir reprogramación" | toggle | true | bool |
| Horario y turnos | "Mínimo horas antes para cancelar" | number ≥0 | 24 | int ≥0 |
| Horario y turnos | "Margen entre turnos (min)" | number ≥0 | 0 | int ≥0 |
| Descuentos por grupo | "Descuentos por grupo activados/desactivados" | toggle | false | bool |
| Descuentos por grupo | "% de descuento…" (2/3/4/5 puestos) | number 0-100 | 5/10/15/20 | 0-100 |
| Descuentos por grupo | "Vigente desde (opcional)" | date | vacío | datetime nullable |
| Descuentos por grupo | "Vigente hasta (opcional)" | date | vacío | datetime nullable |
| Cancelaciones y devoluciones | Manual / Automático | selector | MANUAL | enum |
| Cancelaciones y devoluciones | "WhatsApp de contacto para devoluciones" | tel | vacío | ≤20 chars |
| Emails transaccionales | "Envío de emails activado/desactivado" | toggle | true | bool |
| Emails transaccionales | "Remitente (From)" | text | vacío | ≤200 chars |

---

# Textos literales — botones y mensajes

**Panel — botones:** "Grupo", "Walk-in / Efectivo", "Confirmar pago", "Iniciar sesión", "Finalizar", "Cancelar", "Ver detalle", "Reembolsar y cancelar", "Confirmar reembolso", "Guardar notas", "Iniciar grupo ahora", "Crear grupo · $…", "Nuevo simulador", "Crear simulador", "Guardar horarios", "Guardar descuentos", "Guardar", "Guardar email", "Enviar prueba".

**Tablet — pantallas:** "🏁 Jugar ahora", "Ya tengo código", "INGRESÁ TU CÓDIGO", "El código te llegó al email al confirmar el pago", "Iniciar sesión →", "VALIDANDO...", "TIEMPO RESTANTE", "+TIEMPO", "FINALIZAR", "⚠️ ¡ÚLTIMOS MINUTOS!", "🏁 ¡SESIÓN FINALIZADA!", "GRACIAS, {nombre}", "Volviendo al inicio en unos segundos...".

**Tablet — errores** (`app/api/tablet/activate/route.ts`):
- "Código inválido. Verificá que el código sea correcto y que estés en el simulador correcto." (404)
- "Esta reserva fue cancelada."
- "Esta reserva venció. Realizá una nueva reserva." (EXPIRED)
- "Esta sesión ya fue completada." (FINISHED)
- "Esta reserva no está confirmada. Completá el pago primero." (PENDING)
- "El simulador ya tiene una sesión en curso. Esperá a que termine." (409)
- "Tu sesión se superpondría con la próxima reserva de este simulador. Avisá al operador." (409)
- "Demasiados intentos. Esperá un momento e intentá de nuevo." (429)

**Web de reserva — errores:**
- "El pago no pudo completarse. Intentalo de nuevo." (`?error=payment_failed`)
- "Sin horarios disponibles para este simulador hoy"

**Config — errores:** "La hora de cierre debe ser mayor a la de apertura."

---

# ⚠️ Lo que el manual dice mal (supuestos vs. código real)

0. **FALTA TODO EL FLUJO "JUGAR AHORA" (compra directa en la tablet).** El manual v3.0 afirma o da a entender que solo se juega con reserva/código (glosario "el código es lo único que arranca el simulador"; pág. flujo del cliente solo por la web; pág. tablets solo ingreso de código). **Es falso:** en la tablet, tocando **"🏁 Jugar ahora"** el cliente elige duración, paga por **QR de MercadoPago** y la sesión **arranca sola sin ingresar código**. Es una segunda vía de venta completa (ver sección 8B). Hay que agregarla al manual.
1. **Código de acceso: son 4 caracteres, no 6.** El comentario del schema ("6-digit") está obsoleto. Alfabeto sin O/0/I/1.
2. ~~**CRÍTICO — El código de un grupo NO funciona en la tablet.**~~ **RESUELTO (deploy 2026-08-04).** `/api/tablet/activate` ahora acepta también `groupCode`: cada integrante del grupo entra a la tablet de su simulador, ingresa el código compartido y arranca su puesto. El grupo online ya funciona de punta a punta. **→ En el manual hay que ELIMINAR la página de "atención especial" (pág. 14 v3.0) que describe esta falla y reemplazarla por "los grupos también arrancan con el código en la tablet, igual que una reserva individual".**
3. **"Iniciar sesión" de una reserva individual desde el panel falla en silencio.** El endpoint lo rechaza a propósito ("Para iniciar una sesión, ingresá el código en la tablet…") y el front no muestra el error. Las sesiones individuales arrancan **solo desde la tablet**.
4. **Permisos más laxos de lo esperado.** Solo precios/config/puestos son ADMIN-only. Un OPERATOR puede confirmar pagos, cancelar, **reembolsar** y crear reservas/grupos vía API.
5. **No hay pantalla de usuarios ni recuperación de contraseña.** Los usuarios se crean por DB/seed.
6. **No existen:** filtro por fecha ni por puesto en Reservas · reprogramar desde el panel · reenviar email desde el panel · emails de recordatorio/cancelación/reembolso · bloqueo de días/feriados/mantenimiento · tope de anticipación · campo VR · precios por día/horario/happy-hour · página de estado del sistema · backups en el repo.
7. **Walk-in:** no se elige el monto (toma el del puesto) ni el medio de pago (se asume efectivo/manual).
8. **`groupCode` no es único para siempre** (reutilizable tras FINISHED/CANCELLED/EXPIRED); el `code` individual sí es único para siempre.
9. ~~**Horario configurado ≠ horario del local.**~~ **RESUELTO (2026-08-04):** `closeHour` bajado de 23 a **20**. La web ahora ofrece turnos de 10:00 a 19:45 (último turno de 1 h arranca 19:00 y termina 20:00).
10. **Duración 90 min:** existe en la base y el backend de grupo la acepta, pero la web y los modales del panel solo ofrecen 30/60/120. No es una opción de venta hoy.

---

# Datos de negocio (aportados por el dueño)

1. **Soporte técnico:** Nicolás Bonardi — **+54 9 11 2816-8553**.
2. **Dueños / guardia:** mismo contacto (Nicolás Bonardi, +54 9 11 2816-8553).
3. **Horario del local:** **10:00 a 20:00**. *(Ajustar `closeHour` a 20 en Configuración — ver punto 9 de arriba.)*
4. **Procedimiento de cierre:** se puede **no apagar**; si se apaga, **se apaga todo**. (El sistema tolera el apagado, ver 16.4.)
5. **Reglas de la casa (edad mínima, tolerancia de llegada tarde, reintegros):** **PENDIENTE — falta definir.**
6. **MercadoPago (quién accede / criterio de reembolsos):** **PENDIENTE — falta definir.**
7. **Puestos con VR:** **Simulador 4 y Simulador 5**. *(No hay campo VR en el sistema; es info manual.)*

---

# Sobre las capturas de pantalla

No se pueden generar automáticamente (requieren levantar la app + navegador headless + estado de dispositivos). Cada pantalla está en:
- Dashboard → `app/admin/page.tsx`
- Reservas → `app/admin/reservas/page.tsx`
- Modal nueva reserva → `WalkInModal` en `app/admin/reservas/page.tsx`
- Modal grupo → `GroupModal` en `app/admin/reservas/page.tsx`
- Simuladores → `app/admin/puestos/page.tsx`
- Configuración → `app/admin/configuracion/page.tsx`
- Tablet (reposo / código / sesión) → `app/tablet/[puestoId]/page.tsx`

Recomendación: sacarlas a mano desde `raceroom.com.ar/admin` a 1440px, o que las arme Claude Design como mockups ilustrados a partir de esta descripción.
