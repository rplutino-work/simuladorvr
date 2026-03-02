import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { isSlotAvailable } from "@/lib/availability";
import { z } from "zod";

const manualBookingSchema = z.object({
  puestoId: z.string().min(1),
  duration: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  startTime: z.string().datetime(),
  customerName: z.string().max(100).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
  sendEmail: z.boolean().default(false),
});

/**
 * POST /api/admin/bookings/manual
 * Create a walk-in booking with PAID status (cash payment, no MercadoPago).
 * Admin/Operator only.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = manualBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const { puestoId, duration, startTime: startTimeStr, customerName, customerEmail, notes, sendEmail } =
    parsed.data;

  const startTime = new Date(startTimeStr);
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  const puesto = await prisma.puesto.findUnique({
    where: { id: puestoId },
  });
  if (!puesto) {
    return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
  }

  const available = await isSlotAvailable(puestoId, startTime, endTime);
  if (!available) {
    return NextResponse.json(
      { error: "El horario ya está ocupado" },
      { status: 409 }
    );
  }

  const priceKey = `price${duration}` as "price30" | "price60" | "price120";
  const price = puesto[priceKey];

  // Generate unique code and cancel token
  let code = generateBookingCode();
  let exists = await prisma.booking.findUnique({ where: { code } });
  while (exists) {
    code = generateBookingCode();
    exists = await prisma.booking.findUnique({ where: { code } });
  }
  const cancelToken = generateCancelToken();

  const booking = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        puestoId,
        duration,
        price,
        status: "PAID",
        code,
        cancelToken,
        startTime,
        endTime,
        customerName: customerName ?? undefined,
        customerEmail: customerEmail ?? undefined,
        notes: notes ? `[Walk-in manual] ${notes}` : "[Walk-in manual]",
      },
      include: { puesto: true },
    });
    // Create Payment record so metrics can count this income
    await tx.payment.create({
      data: {
        bookingId: b.id,
        mpPaymentId: `manual-${b.id}`,
        amount: price,
        status: "approved",
      },
    });
    return b;
  });

  // Send confirmation email if requested and email provided
  if (sendEmail && customerEmail) {
    const settings = await prisma.businessSettings.findFirst();
    if (settings?.emailEnabled !== false) {
      const startTimeFormatted = startTime.toLocaleString("es-AR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      });
      const baseUrl = process.env.NEXTAUTH_URL ?? "";
      const cancelUrl =
        settings?.allowCancel && cancelToken
          ? `${baseUrl}/cancelar?token=${cancelToken}`
          : null;
      try {
        await sendBookingConfirmationEmail(
          customerEmail,
          code,
          duration,
          startTimeFormatted,
          puesto.name,
          settings?.emailFrom,
          cancelUrl
        );
      } catch (err) {
        console.error("[manual booking] email failed:", err);
      }
    }
  }

  return NextResponse.json(booking, { status: 201 });
}
