# Operaciones y dependencias externas — Race Room

Guía de todo lo que vive **fuera del código** y hay que configurar/mantener para
que la app funcione bien en producción. Actualizado tras la auditoría integral.

---

## 1. Variables de entorno (Vercel → Project → Settings → Environment Variables)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres (Neon, con `-pooler`). Para `prisma db push` local usar la URL **sin** `-pooler`. |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | ✅ | Firma de sesiones NextAuth. |
| `NEXTAUTH_URL` | ✅ | URL pública (`https://raceroom.com.ar`). Usada en emails y links de cancelación. |
| `MERCADOPAGO_ACCESS_TOKEN` | ✅ | Crear pagos, buscar por `external_reference`, **reembolsos**. |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | ✅ | Checkout del lado del cliente. |
| `MERCADOPAGO_WEBHOOK_SECRET` | ⚠️ Muy recomendada | Valida la firma `x-signature` del webhook. Sin esto, el webhook acepta cualquier POST. Se saca del panel de MP → Webhooks. |
| `NEXT_PUBLIC_MERCADOPAGO_SANDBOX` | Opcional | `"true"` para usar sandbox en las tablets. |
| `RESEND_API_KEY` | ✅ (emails) | Envío de emails transaccionales. |
| `EMAIL_FROM` | ✅ (emails) | Remitente verificado en Resend (dominio raceroom.com.ar). |
| `EMAIL_FALLBACK` | Opcional | Copia oculta / destino de respaldo. |
| `CRON_SECRET` | ✅ | Autoriza el cron de expiración/reconciliación. **Debe coincidir** con el secret del GitHub Action (ver §3). |

> Después de cambiar una env var hay que **redeploy** para que tome efecto.

---

## 2. Deploy

⚠️ **El auto-deploy GitHub → Vercel está roto.** Deployar siempre por CLI:

```bash
npx vercel --prod --yes
```

El build corre en Vercel (el binario SWC nativo no está en este entorno local,
así que `next build` local falla — eso es esperable, no es un error del código).
Antes de cada deploy: `npx tsc --noEmit` para verificar tipos.

Cambios de schema Prisma:

```bash
# la pooled URL no sirve para DDL; usar la directa (sin -pooler)
DATABASE_URL="<url sin -pooler>" npx prisma db push
```

---

## 3. Cron de expiración/reconciliación (GitHub Actions)

Vercel Hobby permite **un solo cron diario**, insuficiente para:
- expirar reservas `PENDING` de más de 30 min,
- auto-finalizar sesiones `ACTIVE` ya vencidas,
- **reconciliar pagos** que MercadoPago aprobó pero cuyo webhook se perdió.

Solución: `.github/workflows/cron-expire-bookings.yml` pega cada ~10 min a
`/api/cron/expire-bookings` con `Authorization: Bearer $CRON_SECRET`.

**Setup (una vez):**
1. GitHub repo → Settings → Secrets and variables → Actions → New secret:
   - `CRON_SECRET` = el mismo valor que en Vercel.
2. (Opcional) Variable `APP_URL` si el dominio cambia (default `https://raceroom.com.ar`).
3. Verificar en la pestaña **Actions** que corra en verde (se puede lanzar a mano con "Run workflow").

> GitHub puede atrasar los crons bajo carga; no es un reloj exacto. Si se
> necesita precisión < 5 min, migrar a Vercel Pro (crons por minuto) o un
> scheduler dedicado (Upstash QStash / cron-job.org).

---

## 4. Observabilidad

- **Logs estructurados:** `lib/logger.ts` emite JSON de una línea (`level`,
  `event`, `ts`, contexto). Ya está cableado en los caminos críticos de dinero:
  webhook de MP, cron de reconciliación y reembolsos.
- **Ver logs:** Vercel → Project → Logs (o `vercel logs`). Filtrar por `level:error`.
- **Pendiente (requiere cuenta externa):** conectar **Sentry** para alertas de
  errores. El punto de enganche ya está marcado en `lib/logger.ts` (función
  `emit`, rama `level === "error"`): agregar ahí `Sentry.captureException`.

---

## 5. Rate limiting

Implementado en DB (`RateLimit` model + `lib/rate-limit.ts`), fail-open.
Suficiente para el volumen actual. Si el tráfico crece o se necesita rate limit
distribuido/edge, migrar a **Upstash Redis** (`@upstash/ratelimit`). No requiere
cambios de esquema de negocio, sólo reemplazar la implementación de `rateLimit()`.

---

## 6. Dispositivos (tablets / TVs)

- Heartbeat: cada kiosko postea a `/api/devices/heartbeat` cada 15 s; el admin
  ve online/offline. Sin dependencia externa.
- Gestión remota (encender TVs, re-emparejar) es vía **Tailscale + ADB** — ver
  `TABLET_APK.md`. Para escala real considerar un **MDM** (Fully Kiosk,
  ManageEngine, etc.); hoy es manual.
- El APK nativo mantiene el kiosko fijo aunque se corte el HDMI. Reinstalar el
  APK requiere USB físico (firmas distintas → `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
  si se intenta OTA sobre otra firma).

---

## 7. Backups de base de datos

Neon hace point-in-time recovery según el plan. Verificar la **retención** en el
panel de Neon y, para tranquilidad extra, programar un `pg_dump` periódico
(puede ser otro GitHub Action) a un bucket privado.

---

## 8. Pendientes que necesitan decisión/cuenta externa

| Ítem | Requiere | Impacto |
|---|---|---|
| Sentry / alertas de error | Cuenta Sentry | Enterarse de errores sin mirar logs a mano. |
| Cron < 5 min exacto | Vercel Pro o scheduler externo | Reconciliación más rápida de pagos. |
| Rate limit distribuido | Upstash Redis | Sólo si crece mucho el tráfico. |
| MDM de kioskos | Servicio MDM | Gestión de flota a escala. |
| Multi-local | Refactor de modelo (agregar `Location`) | Si se abre una segunda sede. |
