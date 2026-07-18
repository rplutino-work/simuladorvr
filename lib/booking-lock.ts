import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Runs `fn` inside a transaction that first takes a Postgres advisory lock
 * keyed by the puesto. All booking creations for the same puesto serialize, so
 * the "check availability → create" sequence is atomic and two customers can't
 * both grab the same slot. The lock is released automatically at commit/rollback.
 */
export async function withPuestoLock<T>(
  puestoId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${puestoId}))`;
    return fn(tx);
  });
}
