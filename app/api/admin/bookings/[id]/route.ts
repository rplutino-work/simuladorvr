import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { z } from "zod";

const updateSchema = z.object({
  status: z
    .enum(["PENDING", "PAID", "ACTIVE", "FINISHED", "EXPIRED", "CANCELLED"])
    .optional(),
  notes: z.string().max(500).nullable().optional(),
  customerName: z.string().max(100).nullable().optional(),
  customerEmail: z.string().email().nullable().optional(),
});

/**
 * GET /api/admin/bookings/[id] - Get single booking detail (admin/operator)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true, payment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(booking);
}

/**
 * PATCH /api/admin/bookings/[id] - Update status/notes (admin/operator)
 * When manually confirming payment (PENDING → PAID), generates code + sends email.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const existing = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  // When manually setting to PAID and no code yet, generate one + create Payment record + send email
  if (parsed.data.status === "PAID" && !existing.code) {
    let code = generateBookingCode();
    let exists = await prisma.booking.findUnique({ where: { code } });
    while (exists) {
      code = generateBookingCode();
      exists = await prisma.booking.findUnique({ where: { code } });
    }
    updateData.code = code;
    const cancelToken = generateCancelToken();
    updateData.cancelToken = cancelToken;

    // Persist booking update + create Payment record in one transaction
    const updatedBooking = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id },
        data: updateData,
        include: { puesto: true, payment: true },
      });
      // Create Payment record so metrics queries can count this income
      await tx.payment.upsert({
        where: { bookingId: id },
        update: { status: "approved", amount: existing.price },
        create: {
          bookingId: id,
          mpPaymentId: `manual-${id}`,
          amount: existing.price,
          status: "approved",
        },
      });
      return b;
    });

    // Send email if recipient available
    const settings = await prisma.businessSettings.findFirst();
    const emailOk = settings?.emailEnabled !== false;
    const emailTo =
      parsed.data.customerEmail ?? existing.customerEmail ?? process.env.EMAIL_FALLBACK;

    if (emailOk && emailTo) {
      const startTime = existing.startTime
        ? existing.startTime.toLocaleString("es-AR", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "America/Argentina/Buenos_Aires",
          })
        : "A confirmar";
      const baseUrl = process.env.NEXTAUTH_URL ?? "";
      const cancelUrl =
        settings?.allowCancel && cancelToken
          ? `${baseUrl}/cancelar?token=${cancelToken}`
          : null;
      try {
        await sendBookingConfirmationEmail(
          emailTo,
          code,
          existing.duration,
          startTime,
          existing.puesto.name,
          settings?.emailFrom,
          cancelUrl
        );
      } catch (err) {
        console.error("[admin confirm] email failed:", err);
      }
    }

    return NextResponse.json(updatedBooking);
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { puesto: true, payment: true },
  });
  return NextResponse.json(booking);
}
