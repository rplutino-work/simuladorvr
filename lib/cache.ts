import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Cached readers for near-immutable data that the kiosks hit on every poll.
 * BusinessSettings and the active-puesto list change rarely, so serving them
 * from a short cache keeps that read off Postgres on the hot polling paths.
 * Invalidated via revalidateTag() when the admin edits settings / puestos.
 */
export const getCachedSettings = unstable_cache(
  async () => prisma.businessSettings.findFirst(),
  ["business-settings"],
  { revalidate: 30, tags: ["settings"] }
);

export const getCachedActivePuestos = unstable_cache(
  async () =>
    prisma.puesto.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ["active-puestos"],
  { revalidate: 60, tags: ["puestos"] }
);
