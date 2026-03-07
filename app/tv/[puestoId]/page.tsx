"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

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

function RacingBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px bg-gradient-to-r from-transparent via-[#E50014]/20 to-transparent"
          style={{ top: `${12 + i * 12}%`, width: "200%" }}
          animate={{ x: ["-100%", "0%"] }}
          transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "linear" }}
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
    <div className={`fixed inset-0 overflow-hidden select-none transition-colors duration-1000 ${
      state === "finished" ? "bg-[#001a00]" : "bg-[#0D0008]"
    }`}>
      <RacingBackground />

      <AnimatePresence mode="wait">
        {/* IDLE — Logo pulsando, disponible */}
        {state === "idle" && (
          <motion.div
            key="idle"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.h1
              className="font-racing text-6xl md:text-8xl text-white tracking-wider"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              SIMULADOR<span className="text-[#E50014]">VR</span>
            </motion.h1>
            <p className="font-condensed text-2xl text-white/30 tracking-[0.3em] mt-6 uppercase">
              {puestoName || `Puesto ${rawPuestoId}`} — Disponible
            </p>
            <motion.div
              className="mt-12 w-3 h-3 rounded-full bg-green-500"
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
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="mb-8 h-16 w-16 rounded-full border-4 border-white/10 border-t-[#E50014]"
              />

              {session.customerName && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-racing text-3xl text-[#E50014] tracking-wider mb-6"
                >
                  {session.customerName.toUpperCase()}
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

        {/* FINISHED — Sesión finalizada */}
        {state === "finished" && (
          <motion.div
            key="finished"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-6xl mb-6"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
            >
              🏁
            </motion.div>
            <h2 className="font-racing text-5xl text-white tracking-wider">
              SESIÓN FINALIZADA
            </h2>
            <p className="font-condensed text-xl text-white/40 tracking-wider mt-4">
              Gracias por tu visita
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
