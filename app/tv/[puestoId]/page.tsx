"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAutoReload } from "@/lib/use-auto-reload";

type SessionData = {
  bookingId: string;
  customerName: string;
  endTime: string;
  duration: number;
  remainingMs: number;
} | null;

type TVState = "idle" | "redirecting" | "game" | "finished";

const POLL_MS = 3000;
const REDIRECT_DELAY_MS = 3000;

function RacingLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px bg-gradient-to-r from-transparent via-[#E50014] to-transparent opacity-40"
          style={{ top: `${15 + i * 14}%`, left: 0, right: 0 }}
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 3 + i * 0.7,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        />
      ))}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={`b${i}`}
          className="absolute h-0.5 bg-gradient-to-r from-transparent via-white to-transparent opacity-15"
          style={{ top: `${30 + i * 20}%`, left: 0, right: 0 }}
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 5 + i,
            repeat: Infinity,
            delay: 1.5 + i * 0.8,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

function tryNativeBridge(method: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (window as any).NativeBridge;
    if (bridge && typeof bridge[method] === "function") {
      bridge[method]();
      return true;
    }
  } catch {
    // Not in native context
  }
  return false;
}

export default function TVPage() {
  useAutoReload();
  const params = useParams();
  const rawPuestoId = params?.puestoId as string;
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [state, setState] = useState<TVState>("idle");
  const [session, setSession] = useState<SessionData>(null);
  const [puestoName, setPuestoName] = useState("");
  const prevSessionRef = useRef<string | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve numeric puesto IDs (1, 2, 3) to real DB IDs
  useEffect(() => {
    const isNumeric = /^\d+$/.test(rawPuestoId);
    if (!isNumeric) {
      setResolvedId(rawPuestoId);
      return;
    }
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((data: { id: string; name: string; active: boolean }[]) => {
        const activos = data.filter((p) => p.active);
        const idx = parseInt(rawPuestoId, 10) - 1;
        if (activos[idx]) setResolvedId(activos[idx].id);
        else if (activos[0]) setResolvedId(activos[0].id);
      })
      .catch(() => {});
  }, [rawPuestoId]);

  const poll = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const res = await fetch(`/api/tablet/${resolvedId}/status`);
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setPuestoName(data.session.puestoName || `Puesto ${rawPuestoId}`);

        // Session just started (wasn't active before)
        if (!prevSessionRef.current || prevSessionRef.current !== data.session.bookingId) {
          prevSessionRef.current = data.session.bookingId;
          setState("redirecting");

          // After delay, switch to HDMI 1
          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          redirectTimerRef.current = setTimeout(() => {
            tryNativeBridge("switchToHdmi1");
            setState("game");
          }, REDIRECT_DELAY_MS);
        }
      } else {
        // No active session
        if (prevSessionRef.current) {
          // Session just ended — switch back to app
          prevSessionRef.current = null;
          tryNativeBridge("switchToApp");
          setState("finished");
          setTimeout(() => {
            setState("idle");
            setSession(null);
          }, 5000);
        } else if (state !== "finished") {
          setState("idle");
          setSession(null);
        }
      }
    } catch {
      // Network error, keep current state
    }
  }, [resolvedId, rawPuestoId, state]);

  useEffect(() => {
    if (!resolvedId) return;
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll, resolvedId]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden select-none bg-black">
      <RacingLines />

      <AnimatePresence mode="wait">
        {/* IDLE — Logo + Disponible (mismo estilo tablet) */}
        {state === "idle" && (
          <motion.div
            key="idle"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="text-center"
            >
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#E50014] shadow-[0_0_40px_rgba(229,0,20,0.6)]">
                  <span className="font-racing text-4xl text-white">V</span>
                </div>
                <h1 className="font-racing text-6xl md:text-8xl tracking-widest text-white">
                  SIMULADOR<span className="text-[#E50014]">VR</span>
                </h1>
              </div>
              <div className="mx-auto h-0.5 w-40 bg-[#E50014] opacity-80" />
            </motion.div>

            <p className="font-condensed text-xl text-white/40 tracking-[0.4em] mt-8 uppercase">
              {puestoName || `Puesto ${rawPuestoId}`} — Disponible
            </p>

            <motion.div
              className="mt-10 w-3 h-3 rounded-full bg-green-500"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        )}

        {/* REDIRECTING — Mensaje antes de cambiar a HDMI */}
        {state === "redirecting" && session && (
          <motion.div
            key="redirecting"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <div className="flex flex-col items-center text-center px-8">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-lg bg-[#E50014] shadow-[0_0_40px_rgba(229,0,20,0.6)]">
                <span className="font-racing text-4xl text-white">V</span>
              </div>

              {session.customerName && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-racing text-3xl text-[#E50014] tracking-wider mb-6"
                >
                  BIENVENIDO, {session.customerName.toUpperCase()}
                </motion.p>
              )}

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="font-racing text-4xl md:text-6xl text-white tracking-wider mb-4"
              >
                PREPARANDO TU SESIÓN
              </motion.h2>

              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="my-6 h-12 w-12 rounded-full border-4 border-white/10 border-t-[#E50014]"
              />

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="font-condensed text-xl text-white/40 tracking-[0.2em] uppercase"
              >
                Te redirigiremos al juego en breve...
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="font-condensed text-lg text-white/25 tracking-wider mt-4"
              >
                Sesión de {session.duration} minutos
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* GAME — Pantalla oscura mientras está en HDMI (puede que no se vea) */}
        {state === "game" && (
          <motion.div
            key="game"
            className="absolute inset-0 bg-black flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="font-condensed text-sm text-white/10 tracking-widest uppercase">
              Sesión en curso — {puestoName}
            </p>
          </motion.div>
        )}

        {/* FINISHED — Sesión finalizada (mismo estilo tablet) */}
        {state === "finished" && (
          <motion.div
            key="finished"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.5, type: "spring" }}
              className="mb-6 text-7xl"
            >
              🏁
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-racing text-5xl md:text-7xl tracking-widest text-white mb-4"
            >
              ¡SESIÓN FINALIZADA!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="font-racing text-2xl tracking-widest text-[#E50014] mb-4"
            >
              ¡GRACIAS POR CORRER CON NOSOTROS!
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-6 font-condensed text-sm tracking-[0.3em] uppercase text-white/20"
            >
              Volviendo al inicio en unos segundos...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
