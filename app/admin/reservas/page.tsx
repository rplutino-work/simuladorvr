"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, X } from "lucide-react";
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

type Booking = {
  id: string;
  code: string | null;
  duration: number;
  price: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  puesto: { name: string };
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  ACTIVE: "Activo",
  FINISHED: "Finalizado",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
};

export default function ReservasPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchBookings = () => {
    const url =
      statusFilter === "all"
        ? "/api/admin/bookings"
        : `/api/admin/bookings?status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then(setBookings)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, [statusFilter]);

  async function handleStatusChange(id: string, newStatus: string) {
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchBookings();
  }

  const badgeVariant = (status: string) => {
    switch (status) {
      case "PAID":
      case "ACTIVE":
        return "success";
      case "PENDING":
        return "secondary";
      case "CANCELLED":
      case "EXPIRED":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
          <p className="mt-1 text-slate-600">Gestiona las reservas del sistema</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de reservas</CardTitle>
          <CardDescription>
            Activar manualmente o cancelar reservas
          </CardDescription>
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
                  <TableHead>Código</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-32">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono font-medium">
                      {b.code ?? "—"}
                    </TableCell>
                    <TableCell>{b.puesto.name}</TableCell>
                    <TableCell>{b.duration} min</TableCell>
                    <TableCell>${(b.price / 100).toLocaleString("es-AR")}</TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(b.status)}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs">
                      {b.startTime
                        ? new Date(b.startTime).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {new Date(b.createdAt).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {b.status === "PAID" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(b.id, "ACTIVE")}
                            title="Activar"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {(b.status === "PENDING" || b.status === "PAID") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(b.id, "CANCELLED")}
                            title="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
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
