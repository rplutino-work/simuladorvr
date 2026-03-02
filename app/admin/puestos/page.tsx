"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Power, PowerOff, Pencil, Check, X } from "lucide-react";
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

type EditForm = {
  name: string;
  price30: string;
  price60: string;
  price120: string;
};

export default function PuestosPage() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", price30: "", price60: "", price120: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", price30: "", price60: "", price120: "" });
  const [saving, setSaving] = useState(false);

  const fetchPuestos = () => {
    fetch("/api/admin/puestos")
      .then((r) => r.json())
      .then(setPuestos)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPuestos(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/puestos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        price30: parseInt(form.price30, 10) || 0,
        price60: parseInt(form.price60, 10) || 0,
        price120: parseInt(form.price120, 10) || 0,
      }),
    });
    if (res.ok) {
      setForm({ name: "", price30: "", price60: "", price120: "" });
      setShowForm(false);
      fetchPuestos();
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/admin/puestos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchPuestos();
  }

  function startEdit(p: Puesto) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      price30: String(p.price30 / 100),
      price60: String(p.price60 / 100),
      price120: String(p.price120 / 100),
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/admin/puestos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        price30: parseFloat(editForm.price30) || 0,
        price60: parseFloat(editForm.price60) || 0,
        price120: parseFloat(editForm.price120) || 0,
      }),
    });
    setSaving(false);
    setEditingId(null);
    fetchPuestos();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Simuladores</h1>
          <p className="mt-1 text-slate-600">Administrá nombres, precios y estado de cada puesto</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo simulador
        </Button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            key="create-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Crear simulador</CardTitle>
                <CardDescription>Precios en ARS (se almacenan en centavos internamente)</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nombre del simulador</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Simulador 1"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Precio 30 min (ARS)</Label>
                    <Input type="number" value={form.price30} onChange={(e) => setForm({ ...form, price30: e.target.value })} placeholder="5000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Precio 60 min (ARS)</Label>
                    <Input type="number" value={form.price60} onChange={(e) => setForm({ ...form, price60: e.target.value })} placeholder="9000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Precio 120 min (ARS)</Label>
                    <Input type="number" value={form.price120} onChange={(e) => setForm({ ...form, price120: e.target.value })} placeholder="16000" />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit">Crear</Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <CardHeader>
          <CardTitle>Lista de simuladores</CardTitle>
          <CardDescription>Click en ✏️ para editar nombre y precios inline</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>30 min</TableHead>
                    <TableHead>60 min</TableHead>
                    <TableHead>120 min</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-32 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {puestos.map((p) =>
                    editingId === p.id ? (
                      // ── EDIT ROW ──────────────────────────────────────────
                      <TableRow key={p.id} className="bg-slate-50">
                        <TableCell>
                          <Input
                            className="h-8 text-sm"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="h-8 w-24 text-sm"
                            value={editForm.price30}
                            onChange={(e) => setEditForm({ ...editForm, price30: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="h-8 w-24 text-sm"
                            value={editForm.price60}
                            onChange={(e) => setEditForm({ ...editForm, price60: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="h-8 w-24 text-sm"
                            value={editForm.price120}
                            onChange={(e) => setEditForm({ ...editForm, price120: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.active ? "success" : "secondary"}>
                            {p.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => saveEdit(p.id)}
                              disabled={saving}
                              title="Guardar"
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingId(null)}
                              title="Cancelar"
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      // ── DISPLAY ROW ───────────────────────────────────────
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>${(p.price30 / 100).toLocaleString("es-AR")}</TableCell>
                        <TableCell>${(p.price60 / 100).toLocaleString("es-AR")}</TableCell>
                        <TableCell>${(p.price120 / 100).toLocaleString("es-AR")}</TableCell>
                        <TableCell>
                          <Badge variant={p.active ? "success" : "secondary"}>
                            {p.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(p)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggle(p.id, p.active)}
                              title={p.active ? "Desactivar" : "Activar"}
                            >
                              {p.active ? (
                                <PowerOff className="h-4 w-4 text-red-500" />
                              ) : (
                                <Power className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
