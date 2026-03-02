"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
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
  price120: number;
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

  async function saveNotes() {
    setSaving(true);
    await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSaving(false);
    onRefresh();
  }

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
              <p className="font-medium">{booking.puesto.name}</p>
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
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    puestoId: puestos[0]?.id ?? "",
    duration: 60 as 30 | 60 | 120,
    date: today,
    time: "10:00",
    customerName: "",
    customerEmail: "",
    notes: "",
    sendEmail: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPuesto = puestos.find((p) => p.id === form.puestoId);
  const priceKey = `price${form.duration}` as "price30" | "price60" | "price120";
  const price = selectedPuesto ? selectedPuesto[priceKey] / 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
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
                  <option key={p.id} value={p.id}>{p.name}</option>
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
              <div className="flex h-9 items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                ${price.toLocaleString("es-AR")}
              </div>
            </div>
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
export default function ReservasPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchBookings = useCallback(() => {
    const url =
      statusFilter === "all"
        ? "/api/admin/bookings"
        : `/api/admin/bookings?status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then(setBookings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetch("/api/admin/puestos")
      .then((r) => r.json())
      .then(setPuestos)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, [fetchBookings]);

  async function handleAction(id: string, status: string) {
    setActionLoading(id + status);
    await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setActionLoading(null);
    fetchBookings();
  }

  function openDetail(b: Booking) {
    setSelectedBooking(b);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
          <p className="mt-1 text-slate-600">Gestión completa de turnos y sesiones</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowWalkIn(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Walk-in / Efectivo
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Object.entries(STATUS_LABELS).map(([status, label]) => {
          const count = bookings.filter((b) => b.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status === statusFilter ? "all" : status)}
              className={`rounded-xl border p-3 text-left transition hover:bg-slate-50 ${statusFilter === status ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900" : "border-slate-200"}`}
            >
              <p className="text-lg font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de reservas</CardTitle>
          <CardDescription>
            {bookings.length} resultado{bookings.length !== 1 ? "s" : ""}
            {statusFilter !== "all" ? ` · filtrado por ${STATUS_LABELS[statusFilter]}` : ""}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Simulador</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Dur.</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => {
                    const isActioning = actionLoading?.startsWith(b.id);
                    return (
                      <TableRow key={b.id} className="group">
                        {/* Code */}
                        <TableCell>
                          {b.code ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 tracking-widest">
                                {b.code}
                              </span>
                              <button
                                onClick={() => copyToClipboard(b.code!)}
                                className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-slate-700"
                                title="Copiar código"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Sin código</span>
                          )}
                        </TableCell>

                        {/* Puesto */}
                        <TableCell className="font-medium text-sm">{b.puesto.name}</TableCell>

                        {/* Customer */}
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {b.customerName && (
                              <div className="flex items-center gap-1 text-slate-700">
                                <User className="h-3 w-3 text-slate-400" />
                                {b.customerName}
                              </div>
                            )}
                            {b.customerEmail && (
                              <div className="flex items-center gap-1 text-slate-500">
                                <Mail className="h-3 w-3 text-slate-400" />
                                <span className="max-w-[140px] truncate">{b.customerEmail}</span>
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
                                <span>Nota</span>
                                {expandedNotes === b.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                            <AnimatePresence>
                              {expandedNotes === b.id && b.notes && (
                                <motion.p
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="text-xs text-slate-600 bg-amber-50 rounded p-1.5 max-w-[180px]"
                                >
                                  {b.notes}
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </div>
                        </TableCell>

                        {/* Time */}
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {b.startTime
                            ? new Date(b.startTime).toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </TableCell>

                        {/* Duration */}
                        <TableCell className="text-sm text-slate-600">{b.duration}m</TableCell>

                        {/* Price */}
                        <TableCell className="text-sm font-medium">
                          ${(b.price / 100).toLocaleString("es-AR")}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-slate-100 text-slate-600"}`}>
                            {STATUS_LABELS[b.status] ?? b.status}
                          </span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {/* PENDING → confirm manual payment */}
                            {b.status === "PENDING" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!!isActioning}
                                onClick={() => handleAction(b.id, "PAID")}
                                title="Confirmar pago manual (genera código)"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            )}
                            {/* PAID → start session */}
                            {b.status === "PAID" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!!isActioning}
                                onClick={() => handleAction(b.id, "ACTIVE")}
                                title="Iniciar sesión"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {/* ACTIVE → finish */}
                            {b.status === "ACTIVE" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!!isActioning}
                                onClick={() => handleAction(b.id, "FINISHED")}
                                title="Finalizar sesión"
                                className="text-slate-600 hover:text-slate-900"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Non-terminal → cancel */}
                            {!["FINISHED", "EXPIRED", "CANCELLED"].includes(b.status) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!!isActioning}
                                onClick={() => handleAction(b.id, "CANCELLED")}
                                title="Cancelar"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Detail */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDetail(b)}
                              title="Ver detalle / notas"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
      </AnimatePresence>
    </div>
  );
}
