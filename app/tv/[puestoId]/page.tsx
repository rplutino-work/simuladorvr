"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useAutoReload } from "@/lib/use-auto-reload";

type SessionData = {
  bookingId: string;
  customerName: string;
  endTime: string;
  duration: number;
  remainingMs: number;
} | null;

type TVState = "off" | "idle" | "redirecting" | "game" | "finished";

const POLL_MS = 8000; // 8s — detectar inicio de turno para pasar a HDMI (≤8s, cubre el caminar-y-sentarse). El anti-fuga (salir del HDMI sin turno) es NATIVO y no depende de esto.
const REDIRECT_DELAY_MS = 3000;

function RacingLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px bg-gradient-to-r from-transparent via-[#E60012] to-transparent opacity-40"
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

function tryNativeBridge(method: string, ...args: unknown[]) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (window as any).NativeBridge;
    if (bridge && typeof bridge[method] === "function") {
      bridge[method](...args);
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
  // Recargar por deploy nuevo SÓLO cuando la TV está apagada (fuera de horario).
  // Los deploys son poco frecuentes, así que se aplican con el local cerrado y la
  // TV NUNCA refresca durante la operación — ni en el home ni en pleno juego. (La
  // TV se llamaba sin guard y por eso hacía "un refresh de la nada", en home y a
  // veces en plena partida, cada vez que salía un deploy.) Un fix urgente se
  // propaga recargando a mano.
  useAutoReload(() => state !== "off");
  const [puestoName, setPuestoName] = useState("");
  // Poll fast during business hours, slow (once a minute) when the screen is
  // off — so the DB isn't hit every 3s all night and Neon can auto-suspend.
  const [pollMs, setPollMs] = useState(POLL_MS);
  const prevSessionRef = useRef<string | null>(null);
  // Cuándo se mandó por última vez al juego (Date.now). Sirve para detectar
  // "atascados en la app con turno" y re-mandar (ver el poll).
  const lastSwitchAtRef = useRef<number>(0);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenStateRef = useRef<boolean>(true);
  const shownFinishedForRef = useRef<string | null>(null);

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

      if (data.puestoName) setPuestoName(data.puestoName);

      // TV power: off if outside business hours or puesto disabled
      const shouldBeOn = data.screenOn !== false;
      setPollMs(shouldBeOn ? POLL_MS : 60000);

      if (!shouldBeOn && screenStateRef.current) {
        screenStateRef.current = false;
        tryNativeBridge("turnOff");
        setState("off");
        setSession(null);
        prevSessionRef.current = null;
        return;
      }

      if (shouldBeOn && !screenStateRef.current) {
        screenStateRef.current = true;
        tryNativeBridge("turnOn");
        setState("idle");
      }

      if (!shouldBeOn) return;

      // Normal session logic
      if (data.session) {
        setSession(data.session);

        // Mandar al juego si: (a) turno NUEVO, o (b) FORZAR si estamos atascados en
        // la app con turno. El poll corre SÓLO con la WebView en primer plano (el HDMI
        // la congela), así que si hay turno, no hay un switch en curso y hace >12s que
        // no mandamos al juego → la app volvió al frente en pleno turno → re-mandar.
        // (Antes sólo miraba el bookingId: si volvía al frente no re-mandaba y la TV
        // quedaba en inicio con turno activo.) No suma consumo: es el mismo poll.
        const stuckOnApp = !redirectTimerRef.current && Date.now() - lastSwitchAtRef.current > 12000;
        if (!prevSessionRef.current || prevSessionRef.current !== data.session.bookingId || stuckOnApp) {
          prevSessionRef.current = data.session.bookingId;
          lastSwitchAtRef.current = Date.now();
          // Una sesión nueva cancela cualquier timer pendiente de "finished→idle"
          // de la sesión anterior; si no, ese timer forzaba idle/setSession(null)
          // en medio de la sesión nueva.
          if (finishedTimerRef.current) {
            clearTimeout(finishedTimerRef.current);
            finishedTimerRef.current = null;
          }
          tryNativeBridge("turnOn");
          setState("redirecting");

          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          const sessionEndTime = data.session.endTime;
          redirectTimerRef.current = setTimeout(() => {
            // Recalcular el tiempo restante en el momento real del switch,
            // para que la alarma nativa de Android dispare justo al final del turno
            // aunque el WebView se congele mientras está en HDMI.
            const msLeft = Math.max(0, new Date(sessionEndTime).getTime() - Date.now());
            tryNativeBridge("scheduleReturn", msLeft);
            // "Últimos minutos" banner drawn over the game (native overlay).
            const WARN_MS = 5 * 60 * 1000;
            const startIn = Math.max(0, msLeft - WARN_MS);
            const windowMs = Math.min(msLeft, WARN_MS);
            tryNativeBridge("showEndingWarning", startIn, windowMs, data.session?.puestoName ?? "");
            tryNativeBridge("switchToHdmi1");
            setState("game");
          }, REDIRECT_DELAY_MS);
        }
      } else {
        if (prevSessionRef.current) {
          const finishedId = prevSessionRef.current;
          prevSessionRef.current = null;
          shownFinishedForRef.current = finishedId;
          // La sesión desapareció (cancelada/terminada) durante los 3s de
          // "preparando": cancelar el redirect pendiente, si no el timer viejo
          // igual hacía switchToHdmi1 → prendía el juego para una sesión muerta
          // (riesgo de juego gratis).
          if (redirectTimerRef.current) {
            clearTimeout(redirectTimerRef.current);
            redirectTimerRef.current = null;
          }
          tryNativeBridge("cancelScheduledReturn");
          tryNativeBridge("cancelEndingWarning");
          tryNativeBridge("switchToApp");
          setState("finished");
          if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
          finishedTimerRef.current = setTimeout(() => {
            finishedTimerRef.current = null;
            setState("idle");
            setSession(null);
          }, 5000);
        } else if (
          data.recentlyFinished &&
          shownFinishedForRef.current !== data.recentlyFinished.bookingId &&
          state !== "finished"
        ) {
          // App restarted (cold start from AlarmManager) and the last session
          // finished within the recently-finished window — show the message
          // ONCE. The ref prevents re-entering the branch while the server
          // keeps reporting the same finished booking for up to 2 minutes.
          shownFinishedForRef.current = data.recentlyFinished.bookingId;
          tryNativeBridge("switchToApp");
          setState("finished");
          if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
          finishedTimerRef.current = setTimeout(() => {
            finishedTimerRef.current = null;
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
  }, [resolvedId, state]);

  useEffect(() => {
    if (!resolvedId) return;
    poll();
    const interval = setInterval(poll, pollMs);
    return () => clearInterval(interval);
  }, [poll, resolvedId, pollMs]);

  // ── Device heartbeat (liveness ping for admin) ──────────────────────────
  // Native path (APK): hand the id to the native bridge, which beats from a
  // native thread that survives the WebView freeze on the PlayStation HDMI
  // input. WebView path (browser/dev, or as a redundant beat while visible):
  // POST directly every 15s. Both hit the same idempotent upsert.
  useEffect(() => {
    if (!resolvedId) return;
    tryNativeBridge("registerDevice", resolvedId, "TV");
    const ping = () => {
      fetch("/api/devices/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puestoId: resolvedId, deviceType: "TV" }),
      }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 180000); // 180s — el heartbeat NATIVO ya reporta liveness; este web es respaldo
    return () => clearInterval(id);
  }, [resolvedId]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden select-none bg-[#0A0A0C]">
      <RacingLines />

      <AnimatePresence mode="wait">
        {/* OFF — Fuera de horario o puesto desactivado */}
        {state === "off" && (
          <motion.div
            key="off"
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

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
              <Image
                src="/race-room-logo.png"
                alt="Race Room"
                width={512}
                height={512}
                priority
                className="h-64 md:h-80 lg:h-96 w-auto mx-auto drop-shadow-[0_0_60px_rgba(230,0,18,0.4)]"
              />
            </motion.div>

            <p className="font-condensed text-lg md:text-xl text-white/50 tracking-[0.4em] mt-8 uppercase flex items-center gap-3">
              <motion.span
                className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {puestoName || `Puesto ${rawPuestoId}`} — Disponible
            </p>
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
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-lg bg-[#E60012] shadow-[0_0_40px_rgba(230,0,18,0.6)]">
                <span className="font-racing text-4xl text-white">V</span>
              </div>

              {session.customerName && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-racing text-3xl text-[#E60012] tracking-wider mb-6"
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
                className="my-6 h-12 w-12 rounded-full border-4 border-white/10 border-t-[#E60012]"
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
              className="font-racing text-2xl tracking-widest text-[#E60012] mb-4"
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
