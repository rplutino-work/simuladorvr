"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/lib/validations/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const data = { email: formData.get("email") as string, password: formData.get("password") as string };
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Datos inválidos");
      return;
    }
    setLoading(true);
    const result = await signIn("credentials", { ...parsed.data, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Credenciales incorrectas");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <Image src="/race-room-rr.png" alt="Race Room" width={64} height={64} className="h-16 w-16 rounded-2xl drop-shadow-[0_0_30px_rgba(230,0,18,0.35)]" priority />
        <h1 className="font-racing mt-4 text-3xl tracking-wide text-white">RACE ROOM</h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-[#E60012]">Panel de control</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/70">Email</Label>
            <Input id="email" name="email" type="email" placeholder="admin@raceroom.com.ar" required autoComplete="email"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-[#E60012]/50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-white/70">Contraseña</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-[#E60012]/50" />
          </div>
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </motion.p>
          )}
          <Button type="submit" className="w-full bg-[#E60012] text-white hover:bg-[#c00010]" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-white/25">Acceso restringido · Race Room</p>
    </motion.div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0C] p-4">
      {/* Ambient red glow */}
      <div className="pointer-events-none absolute -top-1/4 left-1/2 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-[#E60012] opacity-[0.12] blur-[130px]" />
      <Suspense
        fallback={
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#E60012]" />
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
