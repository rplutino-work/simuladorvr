"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Ticket, Clock, Calendar, Hash, Power } from "lucide-react";

type PromoCode = {
  id: string;
  code: string;
  label: string | null;
  minutes: number;
  maxUses: number | null;
  usedCount: number;
  cooldownMin: number;
  validFrom: string | null;
  validTo: string | null;
  validDays: number[];
  validHourFrom: number | null;
  validHourTo: number | null;
  active: boolean;
  createdAt: string;
};

const DAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

type Form = {
  code: string;
  label: string;
  minutes: string;
  maxUses: string;
  cooldownMin: string;
  validFrom: string;
  validTo: string;
  validDays: number[];
  validHourFrom: string;
  validHourTo: string;
  active: boolean;
};

const EMPTY: Form = {
  code: "", label: "", minutes: "10", maxUses: "", cooldownMin: "",
  validFrom: "", validTo: "", validDays: [], validHourFrom: "", validHourTo: "", active: true,
};

/** ISO almacenado → "YYYY-MM-DD" en hora de Argentina, para el input date. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  } catch {
    return "";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

export default function PromocionesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/promo-codes");
      const d = await r.json();
      setCodes(d.codes ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  }

  function openEdit(c: PromoCode) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      label: c.label ?? "",
      minutes: String(c.minutes),
      maxUses: c.maxUses == null ? "" : String(c.maxUses),
      cooldownMin: c.cooldownMin ? String(c.cooldownMin) : "",
      validFrom: toDateInput(c.validFrom),
      validTo: toDateInput(c.validTo),
      validDays: c.validDays ?? [],
      validHourFrom: c.validHourFrom == null ? "" : String(c.validHourFrom),
      validHourTo: c.validHourTo == null ? "" : String(c.validHourTo),
      active: c.active,
    });
    setError("");
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const url = editingId ? `/api/admin/promo-codes/${editingId}` : "/api/admin/promo-codes";
      const r = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Error al guardar.");
        return;
      }
      setShowForm(false);
      await load();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: PromoCode) {
    await fetch(`/api/admin/promo-codes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  }

  async function remove(c: PromoCode) {
    if (!confirm(`¿Borrar el código ${c.code}? (los turnos ya otorgados no se tocan)`)) return;
    await fetch(`/api/admin/promo-codes/${c.id}`, { method: "DELETE" });
    load();
  }

  function toggleDay(d: number) {
    setForm((f) => ({
      ...f,
      validDays: f.validDays.includes(d) ? f.validDays.filter((x) => x !== d) : [...f.validDays, d].sort(),
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Códigos de <span className="font-medium text-slate-700">tiempo gratis</span> configurables. El cliente lo
          ingresa en la tablet y arranca una sesión sin pagar, según las reglas de cada código.
        </p>
        <button
          onClick={openNew}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#E60012] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#c4000f] active:scale-95"
        >
          <Plus className="h-4 w-4" /> Nuevo código
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-[#E60012]" />
        </div>
      ) : codes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Ticket className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Todavía no hay códigos promocionales.</p>
          <button onClick={openNew} className="mt-3 text-sm font-semibold text-[#E60012] hover:underline">
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {codes.map((c) => {
            const maxed = c.maxUses != null && c.usedCount >= c.maxUses;
            return (
              <div
                key={c.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  c.active && !maxed ? "border-slate-200" : "border-slate-200 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-bold tracking-wide text-slate-900">{c.code}</p>
                    {c.label && <p className="truncate text-xs text-slate-500">{c.label}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      maxed
                        ? "bg-amber-50 text-amber-700"
                        : c.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {maxed ? "Agotado" : c.active ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" /> {c.minutes} min gratis
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-slate-400" /> {c.usedCount}
                    {c.maxUses != null ? ` / ${c.maxUses}` : " usos"}
                  </span>
                  {c.cooldownMin > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Power className="h-3.5 w-3.5 text-slate-400" /> cooldown {c.cooldownMin}m
                    </span>
                  )}
                  {(c.validFrom || c.validTo) && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {c.validFrom ? fmtDate(c.validFrom) : "…"}–{c.validTo ? fmtDate(c.validTo) : "…"}
                    </span>
                  )}
                  {(c.validHourFrom != null || c.validHourTo != null) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {c.validHourFrom ?? 0}–{c.validHourTo ?? 24}hs
                    </span>
                  )}
                  {c.validDays.length > 0 && (
                    <span className="text-slate-500">{c.validDays.map((d) => DAYS[d]).join(" ")}</span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => openEdit(c)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => toggleActive(c)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    <Power className="h-3.5 w-3.5" /> {c.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Borrar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal crear/editar ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            >
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? "Editar código" : "Nuevo código promocional"}
              </h2>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Código">
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="VERANO"
                      className="input font-mono"
                    />
                  </Field>
                  <Field label="Minutos gratis">
                    <input
                      type="number"
                      value={form.minutes}
                      onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                      className="input"
                    />
                  </Field>
                </div>

                <Field label="Etiqueta (opcional)">
                  <input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Promo verano — redes"
                    className="input"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Usos máx. (vacío = ilimitado)">
                    <input
                      type="number"
                      value={form.maxUses}
                      onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                      placeholder="∞"
                      className="input"
                    />
                  </Field>
                  <Field label="Cooldown por simulador (min)">
                    <input
                      type="number"
                      value={form.cooldownMin}
                      onChange={(e) => setForm({ ...form, cooldownMin: e.target.value })}
                      placeholder="0"
                      className="input"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vigente desde">
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                      className="input"
                    />
                  </Field>
                  <Field label="Vigente hasta">
                    <input
                      type="date"
                      value={form.validTo}
                      onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                      className="input"
                    />
                  </Field>
                </div>

                <Field label="Días de la semana (vacío = todos)">
                  <div className="flex gap-1.5">
                    {DAYS.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`h-9 flex-1 rounded-lg text-xs font-semibold transition ${
                          form.validDays.includes(i)
                            ? "bg-[#E60012] text-white"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hora desde (0-23, vacío = todas)">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={form.validHourFrom}
                      onChange={(e) => setForm({ ...form, validHourFrom: e.target.value })}
                      className="input"
                    />
                  </Field>
                  <Field label="Hora hasta (1-24)">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={form.validHourTo}
                      onChange={(e) => setForm({ ...form, validHourTo: e.target.value })}
                      className="input"
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-[#E60012] focus:ring-[#E60012]"
                  />
                  Código activo
                </label>

                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-[#E60012] py-2.5 text-sm font-semibold text-white transition hover:bg-[#c4000f] disabled:opacity-50"
                >
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear código"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.55rem 0.7rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: #e60012;
          box-shadow: 0 0 0 3px rgba(230, 0, 18, 0.1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
