import { z } from "zod";

export const createBookingSchema = z.object({
  puestoId: z.string().min(1, "Selecciona un puesto"),
  duration: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  startTime: z.string().datetime(), // ISO string
  customerEmail: z.string().email("Email inválido").optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleSchema = z.object({
  newStartTime: z.string().datetime(),
});

export type RescheduleInput = z.infer<typeof rescheduleSchema>;
