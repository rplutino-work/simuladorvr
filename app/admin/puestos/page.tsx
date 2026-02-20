"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Power, PowerOff } from "lucide-react";
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

export default function PuestosPage() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    price30: "",
    price60: "",
    price120: "",
  });

  const fetchPuestos = () => {
    fetch("/api/admin/puestos")
      .then((r) => r.json())
      .then(setPuestos)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPuestos();
  }, []);

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
    const res = await fetch(`/api/admin/puestos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) fetchPuestos();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Puestos</h1>
          <p className="mt-1 text-slate-600">Simuladores disponibles</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo puesto
        </Button>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Crear puesto</CardTitle>
              <CardDescription>Agrega un nuevo simulador</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Simulador 1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Precio 30 min (ARS)</Label>
                  <Input
                    type="number"
                    value={form.price30}
                    onChange={(e) => setForm({ ...form, price30: e.target.value })}
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Precio 60 min (ARS)</Label>
                  <Input
                    type="number"
                    value={form.price60}
                    onChange={(e) => setForm({ ...form, price60: e.target.value })}
                    placeholder="9000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Precio 120 min (ARS)</Label>
                  <Input
                    type="number"
                    value={form.price120}
                    onChange={(e) => setForm({ ...form, price120: e.target.value })}
                    placeholder="16000"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <Button type="submit">Crear</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de puestos</CardTitle>
          <CardDescription>Activa o desactiva simuladores</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>30 min</TableHead>
                  <TableHead>60 min</TableHead>
                  <TableHead>120 min</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puestos.map((p) => (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(p.id, p.active)}
                        title={p.active ? "Desactivar" : "Activar"}
                      >
                        {p.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
