import { Resend } from "resend";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_xxxx") return null;
  return new Resend(key);
}

export async function sendBookingConfirmationEmail(
  to: string,
  code: string,
  duration: number,
  startTime: string,
  puestoName: string = "Simulador",
  fromOverride?: string | null
) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurado, se omite el email");
    return;
  }

  const from =
    fromOverride ??
    process.env.EMAIL_FROM ??
    "Simulador VR <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `✅ Reserva confirmada – Código ${code}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">🏎️ Simulador VR</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Confirmación de reserva</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 24px;color:#334155;font-size:16px;">¡Tu sesión está confirmada! Presentá este código al llegar.</p>

            <!-- Code box -->
            <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Código de acceso</p>
              <p style="margin:0;font-family:monospace;font-size:40px;font-weight:800;letter-spacing:12px;color:#0f172a;">${code}</p>
            </div>

            <!-- Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#64748b;font-size:14px;">Simulador</span>
                </td>
                <td align="right" style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#0f172a;font-size:14px;font-weight:600;">${puestoName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#64748b;font-size:14px;">Duración</span>
                </td>
                <td align="right" style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#0f172a;font-size:14px;font-weight:600;">${duration} minutos</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;">
                  <span style="color:#64748b;font-size:14px;">Inicio</span>
                </td>
                <td align="right" style="padding:12px 0;">
                  <span style="color:#0f172a;font-size:14px;font-weight:600;">${startTime}</span>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
              Si tenés algún problema, comunicate con nosotros antes de tu turno.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© 2025 Simulador VR · Este es un email automático, no respondas a este mensaje.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("[email] Error al enviar:", error);
    throw new Error("No se pudo enviar el email de confirmación");
  }
}
