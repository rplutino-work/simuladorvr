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
  fromOverride?: string | null,
  cancelUrl?: string | null
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

  const cancelSection = cancelUrl
    ? `
    <!-- Cancel button -->
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="text-align:center;border-top:1px solid #f1f5f9;padding-top:24px;">
          <a href="${cancelUrl}"
            style="display:inline-block;padding:10px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:13px;text-decoration:none;font-weight:500;">
            Cancelar mi reserva
          </a>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">
            Solo disponible antes de que inicie tu turno
          </p>
        </div>
      </td>
    </tr>`
    : "";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `✅ Reserva confirmada – Código ${code}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#0D0008;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0008;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#080C2E;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#E50014;padding:28px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:4px;text-transform:uppercase;">🏎️ SIMULADOR VR</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;">Reserva Confirmada</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 24px;color:rgba(255,255,255,0.7);font-size:15px;">¡Tu sesión está confirmada! Presentá este código al llegar al simulador.</p>

            <!-- Code box -->
            <div style="background:#0D0008;border:2px solid #E50014;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;box-shadow:0 0 20px rgba(229,0,20,0.2);">
              <p style="margin:0 0 8px;color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:3px;">Código de acceso</p>
              <p style="margin:0;font-family:monospace;font-size:44px;font-weight:900;letter-spacing:14px;color:#ffffff;">${code}</p>
            </div>

            <!-- Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <span style="color:rgba(255,255,255,0.4);font-size:13px;">Simulador</span>
                </td>
                <td align="right" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <span style="color:#ffffff;font-size:14px;font-weight:700;">${puestoName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <span style="color:rgba(255,255,255,0.4);font-size:13px;">Duración</span>
                </td>
                <td align="right" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <span style="color:#ffffff;font-size:14px;font-weight:700;">${duration} minutos</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;">
                  <span style="color:rgba(255,255,255,0.4);font-size:13px;">Inicio</span>
                </td>
                <td align="right" style="padding:12px 0;">
                  <span style="color:#ffffff;font-size:14px;font-weight:700;">${startTime}</span>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:rgba(255,255,255,0.35);font-size:12px;text-align:center;">
              Si tenés algún problema, comunicate con nosotros antes de tu turno.
            </p>
          </td>
        </tr>
        ${cancelSection}
        <!-- Footer -->
        <tr>
          <td style="background:#0D0008;padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:11px;">© ${new Date().getFullYear()} Simulador VR · Email automático, no respondas a este mensaje.</p>
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
