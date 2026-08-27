/**
 * Simuladores equipados con VR. Hoy son el 3 y el 4 (se identifica por el número
 * al final del nombre). Centralizado acá para mostrarlo consistente en el admin.
 */
export function hasVR(name?: string | null): boolean {
  if (!name) return false;
  return /\s(3|4)$/.test(name.trim());
}
