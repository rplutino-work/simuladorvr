import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["PENDING", "PAID", "ACTIVE", "FINISHED", "EXPIRED", "CANCELLED"]).optional(),
});

/**
 * PATCH /api/admin/bookings/[id] - Update (e.g. manual activate/cancel)
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
  const booking = await prisma.booking.update({
    where: { id },
    data: parsed.data,
    include: { puesto: true },
  });
  return NextResponse.json(booking);
}
