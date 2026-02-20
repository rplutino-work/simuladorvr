import type { User, Puesto, Booking, Payment } from "@prisma/client";

export type { User, Puesto, Booking, Payment };

export type UserRole = "ADMIN" | "OPERATOR";

export type BookingStatus =
  | "PENDING"
  | "PAID"
  | "ACTIVE"
  | "FINISHED"
  | "EXPIRED"
  | "CANCELLED";

export type BookingDuration = 30 | 60 | 120;

export interface BookingWithRelations extends Booking {
  puesto: Puesto;
  payment?: Payment | null;
}

// Puesto already has price30, price60, price120 in Prisma schema
