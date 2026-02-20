# Simulador VR - Racing Simulator Booking System

MVP de sistema de reservas para simulador de carreras. Next.js 14+, TypeScript, Prisma, NextAuth, MercadoPago y Resend.

## Requisitos

- **Node.js 18+** (recomendado 20+ para Next.js 16 y Vercel)
- PostgreSQL (Neon recomendado)

## Instalación

```bash
npm install
```

## Configuración

1. Copia `.env.example` a `.env`
2. Configura las variables:
   - `DATABASE_URL`: connection string de PostgreSQL (Neon)
   - `AUTH_SECRET`: genera con `openssl rand -base64 32`
   - `MERCADOPAGO_ACCESS_TOKEN`: token de producción o sandbox
   - `RESEND_API_KEY`: para emails transaccionales

## Base de datos

```bash
# Generar cliente Prisma
npm run db:generate

# Aplicar schema (Neon)
npm run db:push

# Seed inicial (admin + operador + puestos)
npm run db:seed
```

**Usuarios por defecto:**
- Admin: `admin@simuladorvr.com` / `admin123`
- Operador: `operador@simuladorvr.com` / `operador123`

## Desarrollo

```bash
npm run dev
```

## Producción (Vercel)

1. Conecta el repo a Vercel
2. Configura las env vars en el dashboard
3. Deploy automático

**Webhook MercadoPago:** Configura la URL `https://tudominio.com/api/webhooks/mercadopago` en tu app de MercadoPago.

## Estructura

```
app/
  admin/         # Dashboard protegido
  api/           # Route handlers
  reserva/       # Flujo público de reserva
components/      # UI (shadcn)
lib/             # DB, auth, validaciones
hooks/           # usePolling
types/
```

## Roles

- **ADMIN**: CRUD puestos, reservas, métricas
- **OPERATOR**: Ver reservas y métricas (no puestos)
