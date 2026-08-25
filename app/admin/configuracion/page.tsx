"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle, AlertCircle, Clock, Mail, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/admin/ui";

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
  trialCooldownMin: number;
};

type ScheduleForm = {
  openHour: number;
  closeHour: number;
  slotInterval: number;
  allowCancel: boolean;
  allowReschedule: boolean;
  cancelLimitHours: number;
  negativeMarginMinutes: number;
  trialCooldownMin: number;
};

const RED_BTN = "bg-[#E60012] text-white hover:bg-[#c00010]";

function SavedTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.span
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"
    >
      <CheckCircle className="h-4 w-4" /> Guardado
    </motion.span>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#E60012]/40 focus:ring-offset-2 ${
        on ? "bg-[#E60012]" : "bg-slate-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

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
    trialCooldownMin: 10,
  });
  const [emailForm, setEmailForm] = useState({ emailEnabled: true, emailFrom: "" });
  const [cancelRefundForm, setCancelRefundForm] = useState<{ cancelMode: "MANUAL" | "AUTOMATIC"; contactPhone: string }>({
    cancelMode: "MANUAL",
    contactPhone: "",
  });

  const [testEmailAddr, setTestEmailAddr] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Group discount
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupOk, setGroupOk] = useState(false);
  // Antes los guardados hacían `catch { console.error }` sin avisar: si el PATCH
  // fallaba, el admin creía que había guardado. Ahora mostramos el error.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<{
    enabled: boolean;
    tiers: Record<string, number>;
    from: string;
    to: string;
  }>({ enabled: false, tiers: { "2": 5, "3": 10, "4": 15, "5": 20 }, from: "", to: "" });

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
          trialCooldownMin: data.trialCooldownMin ?? 10,
        });
        setEmailForm({ emailEnabled: data.emailEnabled ?? true, emailFrom: data.emailFrom ?? "" });
        setCancelRefundForm({ cancelMode: data.cancelMode ?? "MANUAL", contactPhone: data.contactPhone ?? "" });
        const toDate = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");
        setGroupForm({
          enabled: data.groupDiscountEnabled ?? false,
          tiers: (data.groupDiscountTiers as Record<string, number>) ?? { "2": 5, "3": 10, "4": 15, "5": 20 },
          from: toDate(data.groupDiscountFrom),
          to: toDate(data.groupDiscountTo),
        });
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function patch(body: object) {
    setSaveError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    setSettings((prev) => ({ ...(prev as Settings), ...data }));
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleOk(false);
    try {
      await patch(scheduleForm);
      setScheduleOk(true);
      setTimeout(() => setScheduleOk(false), 3000);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar. Reintentá.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailOk(false);
    try {
      await patch({ emailEnabled: emailForm.emailEnabled, emailFrom: emailForm.emailFrom.trim() || null });
      setEmailOk(true);
      setTimeout(() => setEmailOk(false), 3000);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar. Reintentá.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveCancelRefund(e: React.FormEvent) {
    e.preventDefault();
    setSavingCancel(true);
    setCancelOk(false);
    try {
      await patch({ cancelMode: cancelRefundForm.cancelMode, contactPhone: cancelRefundForm.contactPhone.trim() || null });
      setCancelOk(true);
      setTimeout(() => setCancelOk(false), 3000);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar. Reintentá.");
    } finally {
      setSavingCancel(false);
    }
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    setSavingGroup(true);
    setGroupOk(false);
    try {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(groupForm.tiers)) {
        const n = Number(v);
        if (n > 0) clean[k] = n;
      }
      await patch({
        groupDiscountEnabled: groupForm.enabled,
        groupDiscountTiers: clean,
        groupDiscountFrom: groupForm.from ? new Date(groupForm.from + "T00:00:00").toISOString() : null,
        groupDiscountTo: groupForm.to ? new Date(groupForm.to + "T23:59:59").toISOString() : null,
      });
      setGroupOk(true);
      setTimeout(() => setGroupOk(false), 3000);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar. Reintentá.");
    } finally {
      setSavingGroup(false);
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
      setTestEmailResult({ ok: false, message: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setTestEmailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-[#E60012]" />
      </div>
    );
  }

  const inverted = scheduleForm.closeHour <= scheduleForm.openHour;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo guardar: {saveError}
        </div>
      )}
      {/* Horario */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Panel
          title={<span className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#E60012]" /> Horario y turnos</span>}
          description="Rango horario de atención e intervalo entre slots"
        >
          <form onSubmit={handleSaveSchedule} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Hora de apertura">
                <Input type="number" min={0} max={23} value={scheduleForm.openHour}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, openHour: parseInt(e.target.value, 10) || 0 })} />
              </Field>
              <Field label="Hora de cierre">
                <Input type="number" min={0} max={24} value={scheduleForm.closeHour}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, closeHour: parseInt(e.target.value, 10) || 0 })} />
              </Field>
              <Field label="Intervalo de slot (min)">
                <Input type="number" min={5} max={60} value={scheduleForm.slotInterval}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, slotInterval: parseInt(e.target.value, 10) || 15 })} />
              </Field>
            </div>
            {inverted && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" /> La hora de cierre debe ser mayor a la de apertura.
              </p>
            )}

            <div className="space-y-4 border-t border-slate-100 pt-5">
              <h4 className="text-sm font-semibold text-slate-800">Cancelación y reprogramación por el cliente</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <Toggle on={scheduleForm.allowCancel} onClick={() => setScheduleForm({ ...scheduleForm, allowCancel: !scheduleForm.allowCancel })} />
                  <span className="text-sm text-slate-700">Permitir cancelación</span>
                </label>
                <label className="flex items-center gap-3">
                  <Toggle on={scheduleForm.allowReschedule} onClick={() => setScheduleForm({ ...scheduleForm, allowReschedule: !scheduleForm.allowReschedule })} />
                  <span className="text-sm text-slate-700">Permitir reprogramación</span>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mínimo horas antes para cancelar">
                  <Input type="number" min={0} value={scheduleForm.cancelLimitHours}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, cancelLimitHours: parseInt(e.target.value, 10) || 0 })} />
                </Field>
                <Field label="Margen entre turnos (min)">
                  <Input type="number" min={0} value={scheduleForm.negativeMarginMinutes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, negativeMarginMinutes: parseInt(e.target.value, 10) || 0 })} />
                </Field>
                <Field label="Cooldown prueba gratis (min)" hint="Espera entre pruebas con código 8888 por simulador. 0 = desactivado (sin límite).">
                  <Input type="number" min={0} max={240} value={scheduleForm.trialCooldownMin}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, trialCooldownMin: parseInt(e.target.value, 10) || 0 })} />
                </Field>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingSchedule || inverted} className={RED_BTN}>
                {savingSchedule ? "Guardando…" : "Guardar horarios"}
              </Button>
              <SavedTag show={scheduleOk} />
            </div>
          </form>
        </Panel>
      </motion.div>

      {/* Descuentos por grupo */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <Panel
          title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-[#E60012]" /> Descuentos por grupo</span>}
          description="Descuento progresivo al reservar varios puestos juntos (mismo horario)"
        >
          <form onSubmit={handleSaveGroup} className="space-y-5">
            <label className="flex items-center gap-3">
              <Toggle on={groupForm.enabled} onClick={() => setGroupForm({ ...groupForm, enabled: !groupForm.enabled })} />
              <span className="text-sm font-medium text-slate-700">
                {groupForm.enabled ? "Descuentos por grupo activados" : "Descuentos por grupo desactivados"}
              </span>
            </label>

            <div>
              <Label className="text-sm text-slate-700">% de descuento según cantidad de puestos</Label>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {["2", "3", "4", "5"].map((n) => (
                  <div key={n} className="rounded-xl border border-slate-200 p-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{n} puestos</p>
                    <div className="mt-1.5 flex items-center justify-center gap-1">
                      <Input
                        type="number" min={0} max={100}
                        value={groupForm.tiers[n] ?? 0}
                        onChange={(e) => setGroupForm({ ...groupForm, tiers: { ...groupForm.tiers, [n]: Number(e.target.value) || 0 } })}
                        className="h-9 w-16 text-center"
                      />
                      <span className="text-lg font-bold text-[#E60012]">%</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Ejemplo con precio base $10.000/hora */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="text-slate-400">Ejemplo (base $10.000/h):</span>
                {["2", "3", "4", "5"].map((n) => {
                  const cnt = Number(n);
                  const pct = Number(groupForm.tiers[n] ?? 0);
                  const total = Math.round(10000 * cnt * (1 - pct / 100));
                  return (
                    <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {n}: ${total.toLocaleString("es-AR")}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vigente desde (opcional)" hint="Vacío = siempre">
                <Input type="date" value={groupForm.from} onChange={(e) => setGroupForm({ ...groupForm, from: e.target.value })} />
              </Field>
              <Field label="Vigente hasta (opcional)" hint="Ideal para la promo de inauguración">
                <Input type="date" value={groupForm.to} onChange={(e) => setGroupForm({ ...groupForm, to: e.target.value })} />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingGroup} className={RED_BTN}>
                {savingGroup ? "Guardando…" : "Guardar descuentos"}
              </Button>
              <SavedTag show={groupOk} />
            </div>
          </form>
        </Panel>
      </motion.div>

      {/* Cancelaciones y devoluciones */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Panel
          title={<span className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-[#E60012]" /> Cancelaciones y devoluciones</span>}
          description="Cómo se procesan las devoluciones cuando un cliente cancela"
        >
          <form onSubmit={handleSaveCancelRefund} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { mode: "MANUAL", emoji: "📞", title: "Manual", desc: "El cliente cancela y contacta al local por WhatsApp para el reembolso" },
                { mode: "AUTOMATIC", emoji: "💳", title: "Automático", desc: "Reembolso automático vía MercadoPago (solo pagos online)" },
              ] as const).map((opt) => {
                const active = cancelRefundForm.cancelMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setCancelRefundForm({ ...cancelRefundForm, cancelMode: opt.mode })}
                    className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-all ${
                      active ? "border-[#E60012] bg-[#E60012]/[0.04]" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>{opt.emoji}</span> {opt.title}
                      {active && <CheckCircle className="ml-auto h-4 w-4 text-[#E60012]" />}
                    </span>
                    <span className="text-xs text-slate-500">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <Field label="WhatsApp de contacto para devoluciones" hint="Formato internacional sin + (ej: 5491112345678). Se muestra al cliente en modo Manual.">
              <Input type="tel" placeholder="5491112345678" value={cancelRefundForm.contactPhone}
                onChange={(e) => setCancelRefundForm({ ...cancelRefundForm, contactPhone: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingCancel} className={RED_BTN}>
                {savingCancel ? "Guardando…" : "Guardar"}
              </Button>
              <SavedTag show={cancelOk} />
            </div>
          </form>
        </Panel>
      </motion.div>

      {/* Emails */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Panel
          title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#E60012]" /> Emails transaccionales</span>}
          description="Envío de confirmaciones y remitente"
        >
          <form onSubmit={handleSaveEmail} className="space-y-5">
            <label className="flex items-center gap-3">
              <Toggle on={emailForm.emailEnabled} onClick={() => setEmailForm({ ...emailForm, emailEnabled: !emailForm.emailEnabled })} />
              <span className="text-sm font-medium text-slate-700">
                {emailForm.emailEnabled ? "Envío de emails activado" : "Envío de emails desactivado"}
              </span>
            </label>
            <Field label="Remitente (From)" hint="Formato: Nombre <email@dominio.com> · Requiere dominio verificado en Resend. Vacío = usa el del servidor.">
              <Input type="text" placeholder="Race Room <reservas@raceroom.com.ar>" value={emailForm.emailFrom}
                onChange={(e) => setEmailForm({ ...emailForm, emailFrom: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingEmail} className={RED_BTN}>
                {savingEmail ? "Guardando…" : "Guardar email"}
              </Button>
              <SavedTag show={emailOk} />
            </div>
          </form>

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Enviar email de prueba</p>
            <form onSubmit={handleTestEmail} className="flex flex-col gap-3 sm:flex-row">
              <Input type="email" placeholder="tu@email.com" value={testEmailAddr} onChange={(e) => setTestEmailAddr(e.target.value)} required className="flex-1" />
              <Button type="submit" disabled={testEmailLoading} variant="outline">
                <Send className="mr-2 h-4 w-4" />
                {testEmailLoading ? "Enviando…" : "Enviar prueba"}
              </Button>
            </form>
            {testEmailResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-3 flex items-center gap-2 rounded-lg p-3 text-sm ${testEmailResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {testEmailResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {testEmailResult.message}
              </motion.div>
            )}
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}
