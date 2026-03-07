"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type SessionData = {
  bookingId: string;
  customerName: string;
  endTime: string;
  duration: number;
  remainingMs: number;
} | null;

type TVState = "idle" | "active" | "warning" | "finished";

const WARNING_MS = 5 * 60 * 1000;
const POLL_MS = 3000;

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

export default function TVPage() {
  const params = useParams();
  const puestoId = params?.puestoId as string;
  const [state, setState] = useState<TVState>("idle");
  const [session, setSession] = useState<SessionData>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [puestoName, setPuestoName] = useState("");

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/tablet/${puestoId}/status`);
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setPuestoName(data.session.puestoName || `Puesto ${puestoId}`);
        const ms = Math.max(0, new Date(data.session.endTime).getTime() - Date.now());
        setRemainingMs(ms);
        if (ms <= 0) {
          setState("finished");
        } else if (ms <= WARNING_MS) {
          setState("warning");
        } else {
          setState("active");
        }
      } else {
        if (state === "active" || state === "warning") {
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
  }, [puestoId, state]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    if (state !== "active" && state !== "warning") return;
    const timer = setInterval(() => {
      setRemainingMs((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next <= 0) setState("finished");
        else if (next <= WARNING_MS && state !== "warning") setState("warning");
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  const progress = session ? Math.max(0, remainingMs / (session.duration * 60 * 1000)) : 0;

  return (
    <div className={`fixed inset-0 overflow-hidden select-none transition-colors duration-1000 ${
      state === "warning" ? "bg-[#1a0000]" : state === "finished" ? "bg-[#001a00]" : "bg-[#0D0008]"
    }`}>
      <RacingBackground />

      <AnimatePresence mode="wait">
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
              {puestoName || `Puesto ${puestoId}`} — Disponible
            </p>
            <motion.div
              className="mt-12 w-3 h-3 rounded-full bg-green-500"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        )}

        {(state === "active" || state === "warning") && session && (
          <motion.div
            key="active"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
          >
            <div className="flex flex-col items-center">
              <p className="font-condensed text-xl text-white/40 tracking-[0.3em] uppercase mb-4">
                {puestoName || `Puesto ${puestoId}`}
              </p>

              <motion.div
                className={`font-racing leading-none ${
                  state === "warning" ? "text-[#E50014]" : "text-white"
                }`}
                style={{ fontSize: "clamp(6rem, 18vw, 16rem)" }}
                animate={state === "warning" ? { scale: [1, 1.03, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
              >
                {fmtCountdown(remainingMs)}
              </motion.div>

              <p className="font-condensed text-2xl text-white/50 tracking-wider mt-6 uppercase">
                {session.customerName}
              </p>

              {/* Progress bar */}
              <div className="w-[60vw] max-w-2xl h-2 bg-white/10 rounded-full mt-10 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    state === "warning"
                      ? "bg-gradient-to-r from-[#E50014] to-yellow-500"
                      : "bg-gradient-to-r from-[#E50014] to-white/50"
                  }`}
                  style={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              <p className="font-condensed text-sm text-white/25 mt-4 tracking-widest">
                SESIÓN DE {session.duration} MINUTOS
              </p>

              {state === "warning" && (
                <motion.p
                  className="font-condensed text-xl text-[#E50014] mt-6 tracking-wider"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  SESIÓN POR FINALIZAR
                </motion.p>
              )}
            </div>
          </motion.div>
        )}

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
