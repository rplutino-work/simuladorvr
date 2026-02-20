"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
};

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    openHour: 10,
    closeHour: 20,
    slotInterval: 15,
    allowCancel: true,
    allowReschedule: true,
    cancelLimitHours: 24,
    negativeMarginMinutes: 0,
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSettings(data);
        setForm({
          openHour: data.openHour,
          closeHour: data.closeHour,
          slotInterval: data.slotInterval,
          allowCancel: data.allowCancel,
          allowReschedule: data.allowReschedule,
          cancelLimitHours: data.cancelLimitHours,
          negativeMarginMinutes: data.negativeMarginMinutes,
        });
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-semibold text-slate-900">
          Configuración del negocio
        </h1>
        <p className="mt-1 text-slate-600">
          Horarios, intervalos y reglas de cancelación
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Horario y slots</CardTitle>
            <CardDescription>
              Define el rango horario y el intervalo de los turnos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="openHour">Hora de apertura</Label>
                  <Input
                    id="openHour"
                    type="number"
                    min={0}
                    max={23}
                    value={form.openHour}
                    onChange={(e) =>
                      setForm({ ...form, openHour: parseInt(e.target.value, 10) || 0 })
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
                    value={form.closeHour}
                    onChange={(e) =>
                      setForm({ ...form, closeHour: parseInt(e.target.value, 10) || 0 })
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
                    value={form.slotInterval}
                    onChange={(e) =>
                      setForm({ ...form, slotInterval: parseInt(e.target.value, 10) || 15 })
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
                      checked={form.allowCancel}
                      onChange={(e) =>
                        setForm({ ...form, allowCancel: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm">Permitir cancelación</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.allowReschedule}
                      onChange={(e) =>
                        setForm({ ...form, allowReschedule: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm">Permitir reprogramación</span>
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
                      value={form.cancelLimitHours}
                      onChange={(e) =>
                        setForm({
                          ...form,
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
                      value={form.negativeMarginMinutes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          negativeMarginMinutes: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
