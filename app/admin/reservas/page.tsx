"use client";
// v2 — walk-in, confirm payment, session flow

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { hasVR } from "@/lib/puestos";
import {
  Play,
  X,
  CheckCircle,
  Clock,
  CreditCard,
  Copy,
  Eye,
  Plus,
  User,
  Mail,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Users,
} from "lucide-react";
import { groupDiscountPct } from "@/lib/group-discount";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Puesto = {
  id: string;
  name: string;
  active: boolean;
  price30: number;
  price60: number;
  price90?: number;
  price120: number;
};

type Payment = {
  id: string;
  mpPaymentId: string;
  amount: number;
  status: string;
  createdAt: string;
};

type Booking = {
  id: string;
  code: string | null;
  duration: number;
  price: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  customerEmail: string | null;
  customerName: string | null;
  notes: string | null;
  puesto: { id: string; name: string };
  payment: Payment | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  ACTIVE: "En curso",
  FINISHED: "Finalizado",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PAID: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  FINISHED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

/**
 * Hora actual de Argentina (UTC-3) como "HH:MM", redondeada a 15 min. Se usa como
 * default de los modales de walk-in: el cliente está AHORA, así que el turno debe
 * arrancar en la hora actual, no en un valor fijo viejo (antes 10:00 / 20:00, que
 * mostraba "horarios viejos" y podía crear la reserva en el pasado).
 */
function nowARTime(): string {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const mins = Math.min(
    Math.round((ar.getUTCHours() * 60 + ar.getUTCMinutes()) / 15) * 15,
    23 * 60 + 45
  );
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Badge de tipo de reserva a partir de la nota / pago. */
function typeBadge(b: { notes: string | null }): { label: string; cls: string } {
  const n = b.notes ?? "";
  if (n.includes("Prueba") || n.includes("Uso libre"))
    return { label: "Prueba", cls: "bg-amber-100 text-amber-700" };
  if (n.includes("Walk-in"))
    return { label: "Efectivo", cls: "bg-sky-100 text-sky-700" };
  return { label: "MercadoPago", cls: "bg-emerald-100 text-emerald-700" };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function BookingDetail({
  booking,
  onClose,
  onRefresh,
}: {
  booking: Booking;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [notesError, setNotesError] = useState<string | null>(null);
  async function saveNotes() {
    setSaving(true);
    setNotesError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo guardar la nota");
      }
      onRefresh();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "No se pudo guardar la nota");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefund() {
    setRefunding(true);
    setRefundError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reembolsar");
      onRefresh();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Error desconocido");
      setRefunding(false);
      setConfirmRefund(false);
    }
  }

  // A refund makes sense only where money actually changed hands and the
  // booking isn't already cancelled. Reembolsar es SOLO ADMIN (el backend ya lo
  // bloquea con 403; acá ocultamos el botón para que el operador no lo vea).
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const canRefund =
    isAdmin &&
    booking.status !== "CANCELLED" &&
    (booking.payment !== null || booking.status === "PAID" ||
      booking.status === "ACTIVE" || booking.status === "FINISHED");

  function handleCopy() {
    if (booking.code) {
      copyToClipboard(booking.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">Detalle de reserva</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{booking.id}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-6 space-y-4">
          {/* Code */}
          {booking.code && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">Código de acceso</p>
                <p className="font-mono text-2xl font-bold tracking-[0.25em] text-slate-900">
                  {booking.code}
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={handleCopy} title="Copiar código">
                {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Simulador</p>
              <p className="font-medium">
                {booking.puesto.name}
                {hasVR(booking.puesto.name) && (
                  <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-indigo-700">VR</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Estado</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[booking.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABELS[booking.status] ?? booking.status}
              </span>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Duración</p>
              <p className="font-medium">{booking.duration} min</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Precio</p>
              <p className="font-medium">${(booking.price / 100).toLocaleString("es-AR")}</p>
            </div>
            {booking.startTime && (
              <div className="col-span-2">
                <p className="text-slate-500 text-xs">Horario</p>
                <p className="font-medium">
                  {new Date(booking.startTime).toLocaleString("es-AR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {booking.endTime && (
                    <> → {new Date(booking.endTime).toLocaleTimeString("es-AR", { timeStyle: "short" })}</>
                  )}
                </p>
              </div>
            )}
            {booking.customerName && (
              <div>
                <p className="text-slate-500 text-xs">Cliente</p>
                <p className="font-medium">{booking.customerName}</p>
              </div>
            )}
            {booking.customerEmail && (
              <div>
                <p className="text-slate-500 text-xs">Email</p>
                <p className="font-medium truncate">{booking.customerEmail}</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-slate-500 text-xs">Creado</p>
              <p className="font-medium">
                {new Date(booking.createdAt).toLocaleString("es-AR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>

          {/* Payment detail */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Pago
            </p>
            {booking.payment ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Medio</p>
                  <p className="font-medium">
                    {booking.payment.mpPaymentId.startsWith("manual-")
                      ? "Efectivo / manual"
                      : "MercadoPago"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Estado del pago</p>
                  <p className={`font-medium ${booking.payment.status === "refunded" ? "text-red-600" : "text-green-700"}`}>
                    {booking.payment.status === "approved"
                      ? "Aprobado"
                      : booking.payment.status === "refunded"
                      ? "Reembolsado"
                      : booking.payment.status}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Monto</p>
                  <p className="font-medium">
                    ${(booking.payment.amount / 100).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 text-xs">ID MercadoPago</p>
                  <p className="font-mono text-xs truncate">{booking.payment.mpPaymentId}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sin pago registrado (efectivo o pendiente).</p>
            )}

            {/* Refund */}
            {canRefund && (
              <div className="mt-4 border-t border-slate-200 pt-3">
                {refundError && (
                  <p className="mb-2 text-xs text-red-600">{refundError}</p>
                )}
                {booking.payment?.status === "refunded" ? (
                  <p className="text-xs font-medium text-red-600">
                    Esta reserva ya fue reembolsada.
                  </p>
                ) : confirmRefund ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleRefund}
                      disabled={refunding}
                      className="flex-1"
                    >
                      {refunding ? "Reembolsando..." : "Confirmar reembolso"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRefund(false)}
                      disabled={refunding}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmRefund(true)}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Reembolsar y cancelar
                  </Button>
                )}
                <p className="mt-2 text-[11px] leading-snug text-slate-400">
                  {booking.payment && !booking.payment.mpPaymentId.startsWith("manual-")
                    ? "Se procesa el reembolso en MercadoPago y se cancela la reserva."
                    : "Registra el reembolso (efectivo) y cancela la reserva."}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Notas internas</Label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones, aclaraciones del operador..."
            />
            <Button size="sm" onClick={saveNotes} disabled={saving}>
              {saving ? "Guardando..." : "Guardar notas"}
            </Button>
            {notesError && (
              <p className="mt-2 text-sm text-red-600">{notesError}</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Walk-in Modal ─────────────────────────────────────────────────────────────
function WalkInModal({
  puestos,
  onClose,
  onCreated,
}: {
  puestos: Puesto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // Fecha de HOY en horario de Argentina (UTC-3). Con `new Date().toISO...` se
  // tomaba la fecha UTC, que después de las ~21:00 AR ya es mañana → el modal
  // ponía mañana por defecto y bloqueaba cargar un turno de esta misma noche.
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    puestoId: puestos[0]?.id ?? "",
    duration: 60 as 30 | 60 | 120,
    date: today,
    time: nowARTime(),
    customerName: "",
    customerEmail: "",
    notes: "",
    sendEmail: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Si los simuladores cargan DESPUÉS de montar el modal (p.ej. Neon dormido en
  // horario muerto → /api/puestos tarda), el useState arrancó con puestoId="".
  // El <select> igual muestra "Simulador 1" (default del navegador), pero
  // selectedPuesto queda undefined → precio $0 y se enviaría un puesto vacío.
  // Fijamos el primer simulador válido en cuanto la lista está disponible.
  useEffect(() => {
    if (puestos.length && !puestos.some((p) => p.id === form.puestoId)) {
      setForm((f) => ({ ...f, puestoId: puestos[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestos]);

  const selectedPuesto = puestos.find((p) => p.id === form.puestoId);
  const priceKey = `price${form.duration}` as "price30" | "price60" | "price120";
  const price = selectedPuesto ? selectedPuesto[priceKey] / 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guard síncrono anti doble-click: `disabled={loading}` depende de un
    // re-render async, así que un doble clic rápido creaba dos reservas.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // No permitir una hora de inicio en el pasado (con 2 min de tolerancia).
      const startMs = new Date(`${form.date}T${form.time}:00`).getTime();
      if (Number.isFinite(startMs) && startMs < Date.now() - 2 * 60 * 1000) {
        setError("La hora de inicio no puede ser en el pasado. Elegí la hora actual o una futura.");
        setLoading(false);
        submittingRef.current = false;
        return;
      }
      const startTime = new Date(`${form.date}T${form.time}:00`).toISOString();
      const res = await fetch("/api/admin/bookings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: form.puestoId,
          duration: form.duration,
          startTime,
          customerName: form.customerName || undefined,
          customerEmail: form.customerEmail || undefined,
          notes: form.notes || undefined,
          sendEmail: form.sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">Reserva manual (walk-in)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pago en efectivo — se genera código de inmediato</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Simulador</Label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={form.puestoId}
                onChange={(e) => setForm({ ...form, puestoId: e.target.value })}
                required
              >
                {puestos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{hasVR(p.name) ? " · VR" : ""}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Duración</Label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value, 10) as 30 | 60 | 120 })}
              >
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={120}>120 min</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Precio</Label>
              <div className={`flex h-9 items-center rounded-xl border px-3 text-sm font-medium ${price === 0 ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-100 bg-slate-50 text-slate-700"}`}>
                ${price.toLocaleString("es-AR")}
              </div>
            </div>
            {price === 0 && (
              <div className="col-span-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  El precio de este simulador para {form.duration} min es <b>$0</b>.
                  Verificá la configuración de precios antes de crear la reserva.
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.date} min={today} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Hora inicio</Label>
              <Input type="time" step={900} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre cliente (opcional)</Label>
              <Input
                placeholder="Juan Pérez"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email cliente (opcional)</Label>
              <Input
                type="email"
                placeholder="juan@email.com"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Observaciones..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {form.customerEmail && (
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={form.sendEmail}
                    onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                  />
                  Enviar email de confirmación al cliente
                </label>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Creando..." : "Crear reserva"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// ── Group Modal ─────────────────────────────────────────────────────────────
function GroupModal({
  puestos,
  onClose,
  onCreated,
}: {
  puestos: Puesto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // Fecha de HOY en horario de Argentina (UTC-3). Con `new Date().toISO...` se
  // tomaba la fecha UTC, que después de las ~21:00 AR ya es mañana → el modal
  // ponía mañana por defecto y bloqueaba cargar un turno de esta misma noche.
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [settings, setSettings] = useState<{
    groupDiscountEnabled: boolean;
    groupDiscountTiers: Record<string, number> | null;
    groupDiscountFrom: string | null;
    groupDiscountTo: string | null;
  } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<30 | 60 | 120>(60);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowARTime());
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ groupId: string; groupCode: string; total: number; discountPct: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    // Usamos el endpoint público de descuento (no /api/admin/settings, que es
    // ADMIN-only y daba 403 al operador → mostraba precio sin descuento).
    fetch("/api/group-discount")
      .then((r) => r.json())
      .then((d) =>
        setSettings({
          groupDiscountEnabled: d.enabled ?? false,
          groupDiscountTiers: d.tiers ?? null,
          groupDiscountFrom: d.from ?? null,
          groupDiscountTo: d.to ?? null,
        })
      )
      .catch(() => {});
  }, []);

  const priceKey = `price${duration}` as "price30" | "price60" | "price120";
  const selPuestos = puestos.filter((p) => sel.has(p.id));
  const baseTotal = selPuestos.reduce((s, p) => s + (p[priceKey] ?? 0), 0);
  const pct = settings
    ? groupDiscountPct(
        {
          groupDiscountEnabled: settings.groupDiscountEnabled,
          groupDiscountTiers: settings.groupDiscountTiers,
          groupDiscountFrom: settings.groupDiscountFrom ? new Date(settings.groupDiscountFrom) : null,
          groupDiscountTo: settings.groupDiscountTo ? new Date(settings.groupDiscountTo) : null,
        },
        selPuestos.length
      )
    : 0;
  const total = Math.round(baseTotal * (1 - pct / 100));
  const money = (cents: number) => `$${(cents / 100).toLocaleString("es-AR")}`;

  function toggle(id: string) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (selPuestos.length < 2) { setError("Elegí al menos 2 puestos"); return; }
    if (submittingRef.current) return; // guard síncrono anti doble-click
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const startTime = new Date(`${date}T${time}:00`).toISOString();
      const res = await fetch("/api/admin/bookings/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puestoIds: [...sel], duration, startTime, customerName: name || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error al crear el grupo");
      setDone({ groupId: d.groupId, groupCode: d.groupCode, total: d.total, discountPct: d.discountPct });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  async function startNow() {
    if (!done || submittingRef.current) return;
    submittingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings/group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: done.groupId, action: "start" }),
      });
      if (!res.ok) {
        // Antes se ignoraba la respuesta: si el inicio fallaba (p.ej. un puesto ya
        // ocupado), el modal se cerraba como si hubiera arrancado. Ahora avisa.
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo iniciar el grupo");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el grupo");
    } finally {
      setStarting(false);
      submittingRef.current = false;
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-[#E60012]" /> Reserva grupal</h2>
            <p className="text-xs text-slate-500 mt-0.5">Varios puestos, mismo horario, con descuento por grupo</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-slate-900">¡Grupo creado!</h3>
            <p className="mt-1 text-sm text-slate-500">Código del grupo</p>
            <p className="my-2 font-mono text-4xl font-bold tracking-[0.2em] text-slate-900">{done.groupCode}</p>
            <p className="text-sm text-slate-600">{selPuestos.length} puestos · {done.discountPct}% off · <b>{money(done.total)}</b></p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1 bg-[#E60012] text-white hover:bg-[#c00010]" onClick={startNow} disabled={starting}>
                <Play className="mr-2 h-4 w-4" /> {starting ? "Iniciando…" : "Iniciar grupo ahora"}
              </Button>
              <Button variant="outline" onClick={onCreated}>Listo</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-4 p-5">
            <div>
              <Label>Puestos (elegí 2 o más)</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {puestos.map((p) => {
                  const on = sel.has(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => toggle(p.id)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition ${on ? "border-[#E60012] bg-[#E60012]/[0.05] text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      {on && <CheckCircle className="mr-1 inline h-3.5 w-3.5 text-[#E60012]" />}{p.name}{hasVR(p.name) ? " · VR" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label>Duración</Label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) as 30 | 60 | 120)}>
                  <option value={30}>30 min</option><option value={60}>60 min</option><option value={120}>120 min</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Hora</Label><Input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Nombre del grupo (opcional)</Label><Input placeholder="Los pibes" value={name} onChange={(e) => setName(e.target.value)} /></div>

            {/* Resumen de precio */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              {selPuestos.length < 2 ? (
                <p className="text-sm text-slate-400">Elegí al menos 2 puestos para ver el precio con descuento.</p>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    {selPuestos.length} puestos · {duration} min
                    {pct > 0 && <span className="ml-2 rounded-full bg-[#E60012]/10 px-2 py-0.5 text-xs font-semibold text-[#E60012]">-{pct}%</span>}
                  </div>
                  <div className="text-right">
                    {pct > 0 && <span className="mr-2 text-sm text-slate-400 line-through">{money(baseTotal)}</span>}
                    <span className="text-xl font-bold text-slate-900">{money(total)}</span>
                  </div>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading || selPuestos.length < 2} className="flex-1 bg-[#E60012] text-white hover:bg-[#c00010]">
                {loading ? "Creando…" : `Crear grupo · ${money(total)}`}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function ReservasPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Al entrar mostramos SOLO turnos pagos reales (sin pruebas gratis).
  const [typeFilter, setTypeFilter] = useState<string>("real");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const PAGE_SIZE = 50;

  // Debounce the search box so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter/search change resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, dateFrom, dateTo, debouncedSearch]);

  const fetchBookings = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("type", typeFilter);
    if (dateFrom) params.set("from", new Date(`${dateFrom}T00:00:00-03:00`).toISOString());
    if (dateTo) params.set("to", new Date(`${dateTo}T23:59:59-03:00`).toISOString());
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/admin/bookings?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setBookings(data.bookings ?? []);
        setTotal(data.total ?? 0);
        setCounts(data.counts ?? {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, typeFilter, dateFrom, dateTo, debouncedSearch, page]);

  useEffect(() => {
    // Endpoint PÚBLICO (no ADMIN-only): así un OPERATOR también puede listar los
    // simuladores y sus precios para cargar un walk-in. `/api/admin/puestos` daba
    // 403 al operador. Devuelve solo los activos, que es lo que se puede reservar.
    fetch("/api/puestos")
      .then((r) => r.json())
      .then(setPuestos)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, [fetchBookings]);

  async function handleAction(id: string, status: string) {
    // Iniciar una sesión individual NO se puede desde el panel (el backend lo
    // rechaza a propósito): arranca con el código en la tablet. Avisamos en vez
    // de fallar en silencio.
    if (status === "ACTIVE") {
      window.alert(
        "Las sesiones individuales arrancan con el código en la tablet del simulador, no desde el panel."
      );
      return;
    }
    setActionLoading(id + status);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error ?? "No se pudo completar la acción. Probá de nuevo.");
      }
    } catch {
      window.alert("Error de conexión. Probá de nuevo.");
    } finally {
      setActionLoading(null);
      fetchBookings();
    }
  }

  function openDetail(b: Booking) {
    setSelectedBooking(b);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
          <p className="mt-1 text-sm text-slate-600">Gestión completa de turnos y sesiones</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Código, nombre o email…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowGroup(true)} className="shrink-0 border-[#E60012]/30 text-[#E60012] hover:bg-[#E60012]/5">
            <Users className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Grupo</span>
            <span className="sm:hidden">Grupo</span>
          </Button>
          <Button onClick={() => setShowWalkIn(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Walk-in / Efectivo</span>
            <span className="sm:hidden">Walk-in</span>
          </Button>
        </div>
      </div>

      {/* Filtros: tipo de reserva + rango de fechas */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Tipo</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="real">Turnos pagos (reales)</SelectItem>
              <SelectItem value="mp">Online (MercadoPago)</SelectItem>
              <SelectItem value="walkin">Walk-in (efectivo)</SelectItem>
              <SelectItem value="trial">Pruebas gratis</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Desde</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Hasta</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          {([["Hoy", 0], ["7 días", 6], ["30 días", 29]] as [string, number][]).map(([label, d]) => (
            <button
              key={label}
              onClick={() => {
                const arNow = Date.now() - 3 * 3600 * 1000;
                setDateTo(new Date(arNow).toISOString().slice(0, 10));
                setDateFrom(new Date(arNow - d * 86400000).toISOString().slice(0, 10));
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Todo
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Object.entries(STATUS_LABELS).map(([status, label]) => {
          const count = counts[status] ?? 0;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status === statusFilter ? "all" : status)}
              className={`rounded-xl border p-3 text-left transition hover:bg-slate-50 ${statusFilter === status ? "border-[#E60012] bg-[#E60012]/[0.04] ring-1 ring-[#E60012]/40" : "border-slate-200"}`}
            >
              <p className="text-lg font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Bookings list */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de reservas</CardTitle>
          <CardDescription>
            {total} resultado{total !== 1 ? "s" : ""}
            {statusFilter !== "all" ? ` · ${STATUS_LABELS[statusFilter]}` : ""}
            {debouncedSearch ? ` · "${debouncedSearch}"` : ""}
            {total > PAGE_SIZE ? ` · página ${page} de ${Math.ceil(total / PAGE_SIZE)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Clock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p>No hay reservas con este filtro</p>
            </div>
          ) : (
            <>
              {/* ── Mobile / Tablet: card list ──────────────────────── */}
              <div className="space-y-3 lg:hidden">
                {bookings.map((b) => {
                  const isActioning = actionLoading?.startsWith(b.id);
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      {/* Top row: code + status */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          {b.code ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-lg font-bold tracking-widest text-slate-900">
                                {b.code}
                              </span>
                              <button
                                onClick={() => copyToClipboard(b.code!)}
                                className="text-slate-400 hover:text-slate-700 transition"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-slate-400">Sin código</span>
                          )}
                          <p className="text-sm font-medium text-slate-700 mt-0.5">
                            {b.puesto.name}
                            {hasVR(b.puesto.name) && (
                              <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">VR</span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-slate-100 text-slate-600"}`}>
                            {STATUS_LABELS[b.status] ?? b.status}
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${typeBadge(b).cls}`}>
                            {typeBadge(b).label}
                          </span>
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                        <div>
                          <p className="text-slate-400">Inicio</p>
                          <p className="font-medium text-slate-700">
                            {b.startTime
                              ? new Date(b.startTime).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400">Duración · Precio</p>
                          <p className="font-medium text-slate-700">
                            {b.duration}min · ${(b.price / 100).toLocaleString("es-AR")}
                          </p>
                        </div>
                        {(b.customerName || b.customerEmail) && (
                          <div className="col-span-2">
                            <p className="text-slate-400">Cliente</p>
                            <p className="font-medium text-slate-700 truncate">
                              {b.customerName ?? b.customerEmail}
                            </p>
                          </div>
                        )}
                        {b.notes && (
                          <div className="col-span-2">
                            <button
                              onClick={() => setExpandedNotes(expandedNotes === b.id ? null : b.id)}
                              className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>Ver nota</span>
                              {expandedNotes === b.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            <AnimatePresence>
                              {expandedNotes === b.id && (
                                <motion.p
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="mt-1 rounded-lg bg-amber-50 p-2 text-slate-600"
                                >
                                  {b.notes}
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap gap-1">
                          {b.status === "PENDING" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!isActioning}
                              onClick={() => handleAction(b.id, "PAID")}
                              className="h-8 px-3 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              <CreditCard className="mr-1 h-3.5 w-3.5" />
                              Confirmar pago
                            </Button>
                          )}
                          {b.status === "PAID" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!isActioning}
                              onClick={() => handleAction(b.id, "ACTIVE")}
                              className="h-8 px-3 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <Play className="mr-1 h-3.5 w-3.5" />
                              Iniciar sesión
                            </Button>
                          )}
                          {b.status === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!isActioning}
                              onClick={() => handleAction(b.id, "FINISHED")}
                              className="h-8 px-3 text-xs"
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5" />
                              Finalizar
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!["FINISHED", "EXPIRED", "CANCELLED"].includes(b.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!!isActioning}
                              onClick={() => handleAction(b.id, "CANCELLED")}
                              className="h-8 w-8 text-red-500 hover:bg-red-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDetail(b)}
                            className="h-8 w-8"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── Desktop: table (no horizontal scroll) ───────────── */}
              <div className="hidden lg:block">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Código</TableHead>
                      <TableHead className="w-28">Simulador</TableHead>
                      <TableHead className="w-auto">Cliente</TableHead>
                      <TableHead className="w-24">Tipo</TableHead>
                      <TableHead className="w-32 whitespace-nowrap">Inicio</TableHead>
                      <TableHead className="w-16">Dur. / $</TableHead>
                      <TableHead className="w-24">Estado</TableHead>
                      <TableHead className="w-28 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => {
                      const isActioning = actionLoading?.startsWith(b.id);
                      return (
                        <TableRow key={b.id} className="group">
                          {/* Código */}
                          <TableCell className="py-2">
                            {b.code ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-slate-900 text-xs tracking-widest">
                                  {b.code}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(b.code!)}
                                  className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-slate-700 flex-shrink-0"
                                  title="Copiar"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </TableCell>
                          {/* Simulador */}
                          <TableCell className="py-2 text-sm font-medium max-w-[7rem]">
                            <div className="flex items-center gap-1">
                              <span className="truncate">{b.puesto.name}</span>
                              {hasVR(b.puesto.name) && (
                                <span className="shrink-0 rounded bg-indigo-100 px-1 text-[9px] font-bold text-indigo-700">VR</span>
                              )}
                            </div>
                          </TableCell>
                          {/* Cliente */}
                          <TableCell className="py-2">
                            <div className="text-xs space-y-0.5 min-w-0">
                              {b.customerName && (
                                <div className="flex items-center gap-1 text-slate-700 truncate">
                                  <User className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                  <span className="truncate">{b.customerName}</span>
                                </div>
                              )}
                              {b.customerEmail && (
                                <div className="flex items-center gap-1 text-slate-500 truncate">
                                  <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                  <span className="truncate">{b.customerEmail}</span>
                                </div>
                              )}
                              {!b.customerName && !b.customerEmail && (
                                <span className="text-slate-400">—</span>
                              )}
                              {b.notes && (
                                <button
                                  onClick={() => setExpandedNotes(expandedNotes === b.id ? null : b.id)}
                                  className="flex items-center gap-1 text-amber-600 hover:text-amber-700 mt-0.5"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>{expandedNotes === b.id ? "Ocultar" : "Nota"}</span>
                                  {expandedNotes === b.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              )}
                              <AnimatePresence>
                                {expandedNotes === b.id && b.notes && (
                                  <motion.p
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="text-xs text-slate-600 bg-amber-50 rounded p-1.5"
                                  >
                                    {b.notes}
                                  </motion.p>
                                )}
                              </AnimatePresence>
                            </div>
                          </TableCell>
                          {/* Tipo */}
                          <TableCell className="py-2">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${typeBadge(b).cls}`}>
                              {typeBadge(b).label}
                            </span>
                          </TableCell>
                          {/* Inicio */}
                          <TableCell className="py-2 text-xs text-slate-600 whitespace-nowrap">
                            {b.startTime
                              ? new Date(b.startTime).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                              : "—"}
                          </TableCell>
                          {/* Dur + Precio combinados */}
                          <TableCell className="py-2 text-xs text-slate-600">
                            <span className="font-medium">{b.duration}m</span>
                            <br />
                            <span className="text-slate-500">${(b.price / 100).toLocaleString("es-AR")}</span>
                          </TableCell>
                          {/* Estado */}
                          <TableCell className="py-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {STATUS_LABELS[b.status] ?? b.status}
                            </span>
                          </TableCell>
                          {/* Acciones */}
                          <TableCell className="py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {b.status === "PENDING" && (
                                <Button variant="ghost" size="icon" disabled={!!isActioning} onClick={() => handleAction(b.id, "PAID")} title="Confirmar pago" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                  <CreditCard className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {b.status === "PAID" && (
                                <Button variant="ghost" size="icon" disabled={!!isActioning} onClick={() => handleAction(b.id, "ACTIVE")} title="Iniciar sesión" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50">
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {b.status === "ACTIVE" && (
                                <Button variant="ghost" size="icon" disabled={!!isActioning} onClick={() => handleAction(b.id, "FINISHED")} title="Finalizar sesión" className="h-7 w-7 text-slate-600 hover:text-slate-900">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {!["FINISHED", "EXPIRED", "CANCELLED"].includes(b.status) && (
                                <Button variant="ghost" size="icon" disabled={!!isActioning} onClick={() => handleAction(b.id, "CANCELLED")} title="Cancelar" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openDetail(b)} title="Ver detalle" className="h-7 w-7">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    Mostrando {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, total)} de {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {page} / {Math.ceil(total / PAGE_SIZE)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <AnimatePresence>
        {selectedBooking && (
          <BookingDetail
            key={selectedBooking.id}
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onRefresh={() => {
              fetchBookings();
              setSelectedBooking(null);
            }}
          />
        )}
        {showWalkIn && (
          <WalkInModal
            key="walkin"
            puestos={puestos.filter((p) => p.active)}
            onClose={() => setShowWalkIn(false)}
            onCreated={() => {
              setShowWalkIn(false);
              fetchBookings();
            }}
          />
        )}
        {showGroup && (
          <GroupModal
            key="group"
            puestos={puestos.filter((p) => p.active)}
            onClose={() => setShowGroup(false)}
            onCreated={() => {
              setShowGroup(false);
              fetchBookings();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
