"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Settings = {
  id: string;
  openHour: number;
  closeHour: number;
  slotInterval: number;
  allowCancel: boolean;
  allowReschedule: boolean;
  cancelLimitHours: number;
  negativeMarginMinutes: number;
  emailEnabled: boolean;
  emailFrom: string | null;
  cancelMode: "MANUAL" | "AUTOMATIC";
  contactPhone: string | null;
};

type CancelRefundForm = {
  cancelMode: "MANUAL" | "AUTOMATIC";
  contactPhone: string;
};

type ScheduleForm = {
  openHour: number;
  closeHour: number;
  slotInterval: number;
  allowCancel: boolean;
  allowReschedule: boolean;
  cancelLimitHours: number;
  negativeMarginMinutes: number;
};

type EmailForm = {
  emailEnabled: boolean;
  emailFrom: string;
};

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingCancel, setSavingCancel] = useState(false);
  const [scheduleOk, setScheduleOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);
  const [cancelOk, setCancelOk] = useState(false);

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    openHour: 10,
    closeHour: 20,
    slotInterval: 15,
    allowCancel: true,
    allowReschedule: true,
    cancelLimitHours: 24,
    negativeMarginMinutes: 0,
  });

  const [emailForm, setEmailForm] = useState<EmailForm>({
    emailEnabled: true,
    emailFrom: "",
  });

  const [cancelRefundForm, setCancelRefundForm] = useState<CancelRefundForm>({
    cancelMode: "MANUAL",
    contactPhone: "",
  });

  // Test email
  const [testEmailAddr, setTestEmailAddr] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSettings(data);
        setScheduleForm({
          openHour: data.openHour,
          closeHour: data.closeHour,
          slotInterval: data.slotInterval,
          allowCancel: data.allowCancel,
          allowReschedule: data.allowReschedule,
          cancelLimitHours: data.cancelLimitHours,
          negativeMarginMinutes: data.negativeMarginMinutes,
        });
        setEmailForm({
          emailEnabled: data.emailEnabled ?? true,
          emailFrom: data.emailFrom ?? "",
        });
        setCancelRefundForm({
          cancelMode: data.cancelMode ?? "MANUAL",
          contactPhone: data.contactPhone ?? "",
        });
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleOk(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSettings((prev) => ({ ...(prev as Settings), ...data }));
      setScheduleOk(true);
      setTimeout(() => setScheduleOk(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailOk(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: emailForm.emailEnabled,
          emailFrom: emailForm.emailFrom.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSettings((prev) => ({ ...(prev as Settings), ...data }));
      setEmailOk(true);
      setTimeout(() => setEmailOk(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveCancelRefund(e: React.FormEvent) {
    e.preventDefault();
    setSavingCancel(true);
    setCancelOk(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancelMode: cancelRefundForm.cancelMode,
          contactPhone: cancelRefundForm.contactPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSettings((prev) => ({ ...(prev as Settings), ...data }));
      setCancelOk(true);
      setTimeout(() => setCancelOk(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCancel(false);
    }
  }

  async function handleTestEmail(e: React.FormEvent) {
    e.preventDefault();
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmailAddr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setTestEmailResult({ ok: true, message: data.message ?? "Email enviado" });
    } catch (err) {
      setTestEmailResult({
        ok: false,
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setTestEmailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        <p className="mt-1 text-slate-600">
          Horarios, reglas de cancelación y emails transaccionales
        </p>
      </div>

      {/* ── Schedule settings ─────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle>Horario y turnos</CardTitle>
            <CardDescription>
              Define el rango horario y el intervalo entre slots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSchedule} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="openHour">Hora de apertura</Label>
                  <Input
                    id="openHour"
                    type="number"
                    min={0}
                    max={23}
                    value={scheduleForm.openHour}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        openHour: parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closeHour">Hora de cierre</Label>
                  <Input
                    id="closeHour"
                    type="number"
                    min={0}
                    max={24}
                    value={scheduleForm.closeHour}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        closeHour: parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slotInterval">Intervalo de slot (min)</Label>
                  <Input
                    id="slotInterval"
                    type="number"
                    min={5}
                    max={60}
                    value={scheduleForm.slotInterval}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        slotInterval: parseInt(e.target.value, 10) || 15,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-200 pt-6">
                <h3 className="font-medium text-slate-900">
                  Cancelación y reprogramación
                </h3>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scheduleForm.allowCancel}
                      onChange={(e) =>
                        setScheduleForm({
                          ...scheduleForm,
                          allowCancel: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm">Permitir cancelación por el cliente</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scheduleForm.allowReschedule}
                      onChange={(e) =>
                        setScheduleForm({
                          ...scheduleForm,
                          allowReschedule: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm">Permitir reprogramación por el cliente</span>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cancelLimitHours">
                      Mínimo horas antes para cancelar
                    </Label>
                    <Input
                      id="cancelLimitHours"
                      type="number"
                      min={0}
                      value={scheduleForm.cancelLimitHours}
                      onChange={(e) =>
                        setScheduleForm({
                          ...scheduleForm,
                          cancelLimitHours: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="negativeMarginMinutes">
                      Margen entre turnos (min)
                    </Label>
                    <Input
                      id="negativeMarginMinutes"
                      type="number"
                      min={0}
                      value={scheduleForm.negativeMarginMinutes}
                      onChange={(e) =>
                        setScheduleForm({
                          ...scheduleForm,
                          negativeMarginMinutes: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={savingSchedule}>
                  {savingSchedule ? "Guardando..." : "Guardar horarios"}
                </Button>
                {scheduleOk && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-sm text-green-600"
                  >
                    <CheckCircle className="h-4 w-4" /> Guardado
                  </motion.span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Email settings ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Configuración de emails</CardTitle>
            <CardDescription>
              Activá o desactivá el envío de confirmaciones. El remitente puede
              sobreescribir la variable <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">EMAIL_FROM</code> del servidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEmail} className="space-y-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setEmailForm({
                      ...emailForm,
                      emailEnabled: !emailForm.emailEnabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                    emailForm.emailEnabled ? "bg-slate-900" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      emailForm.emailEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  {emailForm.emailEnabled
                    ? "Envío de emails activado"
                    : "Envío de emails desactivado"}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailFrom">
                  Remitente (From)
                  <span className="ml-1.5 text-xs text-slate-400">— dejar vacío para usar el del servidor</span>
                </Label>
                <Input
                  id="emailFrom"
                  type="text"
                  placeholder="Simulador VR <noreply@tudominio.com>"
                  value={emailForm.emailFrom}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, emailFrom: e.target.value })
                  }
                />
                <p className="text-xs text-slate-400">
                  Formato: <code>Nombre &lt;email@dominio.com&gt;</code> · Requiere dominio verificado en Resend
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={savingEmail}>
                  {savingEmail ? "Guardando..." : "Guardar configuración email"}
                </Button>
                {emailOk && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-1.5 text-sm text-green-600"
                  >
                    <CheckCircle className="h-4 w-4" /> Guardado
                  </motion.span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Cancel & Refund settings ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Cancelaciones y devoluciones</CardTitle>
            <CardDescription>
              Define cómo se procesan las devoluciones cuando un cliente cancela su reserva.
              El botón de cancelar aparece en el email de confirmación cuando las cancelaciones están habilitadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveCancelRefund} className="space-y-6">
              <div className="space-y-3">
                <Label>Modo de devolución</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCancelRefundForm({ ...cancelRefundForm, cancelMode: "MANUAL" })
                    }
                    className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-all ${
                      cancelRefundForm.cancelMode === "MANUAL"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span className="font-semibold text-sm">📞 Manual</span>
                    <span
                      className={`text-xs ${
                        cancelRefundForm.cancelMode === "MANUAL"
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      El cliente cancela y contacta al local por WhatsApp para el reembolso
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCancelRefundForm({ ...cancelRefundForm, cancelMode: "AUTOMATIC" })
                    }
                    className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-all ${
                      cancelRefundForm.cancelMode === "AUTOMATIC"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span className="font-semibold text-sm">💳 Automático</span>
                    <span
                      className={`text-xs ${
                        cancelRefundForm.cancelMode === "AUTOMATIC"
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      Se procesa el reembolso automático vía MercadoPago (solo pagos online)
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPhone">
                  Número de WhatsApp para contacto de devoluciones
                  <span className="ml-1.5 text-xs text-slate-400">
                    — formato internacional sin + (ej: 5491112345678)
                  </span>
                </Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  placeholder="5491112345678"
                  value={cancelRefundForm.contactPhone}
                  onChange={(e) =>
                    setCancelRefundForm({
                      ...cancelRefundForm,
                      contactPhone: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-slate-400">
                  Este número se muestra al cliente cuando cancela en modo Manual.
                  También sirve de contacto de respaldo en caso de fallo del reembolso automático.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={savingCancel}>
                  {savingCancel ? "Guardando..." : "Guardar configuración"}
                </Button>
                {cancelOk && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-1.5 text-sm text-green-600"
                  >
                    <CheckCircle className="h-4 w-4" /> Guardado
                  </motion.span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Test email ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Enviar email de prueba</CardTitle>
            <CardDescription>
              Verifica que la clave de Resend y el remitente estén correctamente
              configurados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTestEmail} className="flex flex-col gap-4 sm:flex-row">
              <Input
                type="email"
                placeholder="tu@email.com"
                value={testEmailAddr}
                onChange={(e) => setTestEmailAddr(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="submit" disabled={testEmailLoading} variant="outline">
                <Send className="mr-2 h-4 w-4" />
                {testEmailLoading ? "Enviando..." : "Enviar prueba"}
              </Button>
            </form>
            {testEmailResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm ${
                  testEmailResult.ok
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {testEmailResult.ok ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                {testEmailResult.message}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
