import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendBookingConfirmationEmail(
  to: string,
  code: string,
  duration: number,
  startTime: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set, skipping email");
    return;
  }

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Simulador VR <onboarding@resend.dev>",
    to,
    subject: `Tu código de reserva: ${code}`,
    html: `
      <h1>Reserva confirmada</h1>
      <p>Tu sesión de <strong>${duration} minutos</strong> está confirmada.</p>
      <p><strong>Código de acceso:</strong> <code style="font-size:1.5em;letter-spacing:0.2em;background:#f1f5f9;padding:0.25em 0.5em;border-radius:0.5rem;">${code}</code></p>
      <p>Inicio: ${startTime}</p>
      <p>Presenta este código al llegar al simulador.</p>
    `,
  });

  if (error) {
    console.error("[email] Failed to send:", error);
    throw new Error("No se pudo enviar el email de confirmación");
  }
}
