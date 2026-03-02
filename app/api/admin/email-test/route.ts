import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

/**
 * POST /api/admin/email-test
 * Send a test confirmation email (admin only)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Email inválido" },
      { status: 400 }
    );
  }

  try {
    await sendBookingConfirmationEmail(
      parsed.data.email,
      "TEST01",
      60,
      new Date().toLocaleString("es-AR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      }),
      "Simulador de Prueba"
    );
    return NextResponse.json({ ok: true, message: "Email de prueba enviado" });
  } catch (err) {
    console.error("[email-test]", err);
    return NextResponse.json(
      { error: "No se pudo enviar el email. Verificá la clave de Resend." },
      { status: 500 }
    );
  }
}
