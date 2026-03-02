"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface BookingInfo {
  id: string;
  code: string | null;
  status: string;
  startTime: string | null;
  duration: number;
  puesto: string;
  price: number;
  customerName: string | null;
}

interface ApiResponse {
  booking: BookingInfo;
  canCancel: boolean;
  reason: string | null;
  cancelMode: "MANUAL" | "AUTOMATIC";
  contactPhone: string | null;
  cancelLimitHours: number;
}

type PageState =
  | "loading"
  | "error"
  | "confirm"
  | "processing"
  | "cancelled-manual"
  | "cancelled-auto"
  | "cancelled-refund-error";

function CancelContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [pageState, setPageState] = useState<PageState>("loading");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [bookingPuesto, setBookingPuesto] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Enlace de cancelación inválido o expirado.");
      setPageState("error");
      return;
    }

    fetch(`/api/cancelar?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setErrorMsg(json.error);
          setPageState("error");
          return;
        }
        setData(json as ApiResponse);
        setPageState("confirm");
      })
      .catch(() => {
        setErrorMsg("No se pudo cargar la información de tu reserva.");
        setPageState("error");
      });
  }, [token]);

  const handleCancel = async () => {
    if (!token || !data) return;
    setPageState("processing");

    try {
      const res = await fetch("/api/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setErrorMsg(json.error ?? "No se pudo cancelar la reserva.");
        setPageState("error");
        return;
      }

      setContactPhone(json.contactPhone);
      setBookingCode(data.booking.code);
      setBookingPuesto(data.booking.puesto);

      if (json.refunded) {
        setPageState("cancelled-auto");
      } else if (json.needsContact) {
        if (json.reason && json.reason.includes("reembolso")) {
          setPageState("cancelled-refund-error");
        } else {
          setPageState("cancelled-manual");
        }
      } else {
        setPageState("cancelled-auto");
      }
    } catch {
      setErrorMsg("Error de conexión. Intentalo de nuevo.");
      setPageState("error");
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "A confirmar";
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  };

  const buildWhatsApp = (phone: string, code: string | null, puesto: string) => {
    const msg = encodeURIComponent(
      `Hola, quiero coordinar el reembolso de mi reserva cancelada en ${puesto}${code ? `, código ${code}` : ""}.`
    );
    return `https://wa.me/${phone}?text=${msg}`;
  };

  return (
    <div className="min-h-screen bg-[#0D0008] flex flex-col">
      {/* Header */}
      <header className="bg-[#080C2E] border-b border-white/10 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="font-racing text-2xl tracking-widest text-white">
            SIMULADOR<span className="text-[#E50014]">VR</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {pageState === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="w-12 h-12 border-4 border-[#E50014]/30 border-t-[#E50014] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/60 font-condensed text-lg tracking-widest uppercase">
                Cargando tu reserva...
              </p>
            </motion.div>
          )}

          {/* Error */}
          {pageState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-md w-full bg-[#080C2E] border border-[#E50014]/30 rounded-2xl p-8 text-center"
            >
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="font-racing text-2xl text-white tracking-widest mb-3">
                Enlace inválido
              </h2>
              <p className="text-white/60 font-condensed mb-6">{errorMsg}</p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-[#E50014] text-white font-racing tracking-widest rounded-lg hover:bg-[#c0001a] transition-colors"
              >
                VOLVER AL INICIO
              </Link>
            </motion.div>
          )}

          {/* Confirm cancel */}
          {pageState === "confirm" && data && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-lg w-full"
            >
              <div className="bg-[#080C2E] border border-white/10 rounded-2xl overflow-hidden">
                {/* Top bar */}
                <div className="bg-[#E50014] px-6 py-4 text-center">
                  <h1 className="font-racing text-2xl md:text-3xl tracking-widest text-white">
                    CANCELAR RESERVA
                  </h1>
                </div>

                <div className="p-6 md:p-8">
                  {/* Booking details */}
                  <div className="bg-[#0D0008] border border-white/10 rounded-xl p-5 mb-6">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {data.booking.code && (
                        <>
                          <span className="text-white/40 font-condensed uppercase tracking-wider">
                            Código
                          </span>
                          <span className="text-white font-mono font-bold text-right">
                            {data.booking.code}
                          </span>
                        </>
                      )}
                      <span className="text-white/40 font-condensed uppercase tracking-wider">
                        Simulador
                      </span>
                      <span className="text-white font-semibold text-right">
                        {data.booking.puesto}
                      </span>
                      <span className="text-white/40 font-condensed uppercase tracking-wider">
                        Inicio
                      </span>
                      <span className="text-white font-semibold text-right text-xs leading-snug">
                        {formatDate(data.booking.startTime)}
                      </span>
                      <span className="text-white/40 font-condensed uppercase tracking-wider">
                        Duración
                      </span>
                      <span className="text-white font-semibold text-right">
                        {data.booking.duration} min
                      </span>
                      <span className="text-white/40 font-condensed uppercase tracking-wider">
                        Total pagado
                      </span>
                      <span className="text-white font-semibold text-right">
                        ${(data.booking.price / 100).toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>

                  {/* Can cancel or not */}
                  {!data.canCancel ? (
                    <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 mb-6 text-center">
                      <p className="text-yellow-300 font-condensed text-sm tracking-wide">
                        ⚠️ {data.reason}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Refund info */}
                      <div className="bg-[#0D0008] border border-white/10 rounded-xl p-4 mb-6">
                        {data.cancelMode === "AUTOMATIC" ? (
                          <p className="text-white/60 font-condensed text-sm tracking-wide text-center">
                            💳 El reembolso se procesará automáticamente en{" "}
                            <span className="text-white font-bold">3 a 10 días hábiles</span> al
                            medio de pago original.
                          </p>
                        ) : (
                          <p className="text-white/60 font-condensed text-sm tracking-wide text-center">
                            📞 Una vez cancelada la reserva, te indicaremos cómo coordinar el
                            reembolso vía{" "}
                            <span className="text-white font-bold">WhatsApp</span>.
                          </p>
                        )}
                      </div>

                      {/* Confirm button */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCancel}
                        className="w-full py-4 bg-[#E50014] hover:bg-[#c0001a] text-white font-racing text-xl tracking-widest rounded-xl transition-colors"
                      >
                        CONFIRMAR CANCELACIÓN
                      </motion.button>

                      <p className="text-white/25 font-condensed text-xs text-center mt-3 tracking-wide">
                        Esta acción no se puede deshacer
                      </p>
                    </>
                  )}

                  <div className="mt-4 text-center">
                    <Link
                      href="/"
                      className="text-white/40 font-condensed text-sm hover:text-white transition-colors tracking-wide"
                    >
                      ← Volver al inicio
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Processing */}
          {pageState === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="w-12 h-12 border-4 border-[#E50014]/30 border-t-[#E50014] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/60 font-condensed text-lg tracking-widest uppercase">
                Procesando cancelación...
              </p>
            </motion.div>
          )}

          {/* Cancelled — automatic refund */}
          {pageState === "cancelled-auto" && (
            <motion.div
              key="cancelled-auto"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md w-full bg-[#080C2E] border border-green-500/30 rounded-2xl overflow-hidden text-center"
            >
              <div className="bg-green-700 px-6 py-4">
                <h2 className="font-racing text-2xl tracking-widest text-white">
                  RESERVA CANCELADA
                </h2>
              </div>
              <div className="p-8">
                <div className="text-5xl mb-4">✅</div>
                <p className="text-white font-condensed text-lg mb-2">
                  Tu reserva fue cancelada exitosamente.
                </p>
                <p className="text-white/60 font-condensed text-sm mb-8">
                  El reembolso se procesará en <strong className="text-white">3 a 10 días hábiles</strong>{" "}
                  en tu medio de pago original.
                </p>
                <Link
                  href="/"
                  className="inline-block px-8 py-3 bg-[#E50014] text-white font-racing tracking-widest rounded-xl hover:bg-[#c0001a] transition-colors"
                >
                  VOLVER AL INICIO
                </Link>
              </div>
            </motion.div>
          )}

          {/* Cancelled — manual refund */}
          {(pageState === "cancelled-manual" || pageState === "cancelled-refund-error") && (
            <motion.div
              key="cancelled-manual"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md w-full bg-[#080C2E] border border-white/10 rounded-2xl overflow-hidden text-center"
            >
              <div className="bg-[#E50014] px-6 py-4">
                <h2 className="font-racing text-2xl tracking-widest text-white">
                  RESERVA CANCELADA
                </h2>
              </div>
              <div className="p-8">
                <div className="text-5xl mb-4">📞</div>
                <p className="text-white font-condensed text-lg mb-2">
                  Tu reserva fue cancelada exitosamente.
                </p>
                <p className="text-white/60 font-condensed text-sm mb-6">
                  Para gestionar el reembolso, comunicate con nosotros por WhatsApp.
                </p>

                {contactPhone ? (
                  <a
                    href={buildWhatsApp(contactPhone, bookingCode, bookingPuesto)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full py-4 bg-green-600 hover:bg-green-500 text-white font-racing text-lg tracking-widest rounded-xl transition-colors mb-4"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    CONTACTAR POR WHATSAPP
                  </a>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 text-white/60 font-condensed text-sm">
                    Comunicate con el local para coordinar el reembolso.
                  </div>
                )}

                <Link
                  href="/"
                  className="inline-block px-8 py-3 text-white/50 font-condensed tracking-widest hover:text-white transition-colors text-sm"
                >
                  Volver al inicio
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-[#080C2E] border-t border-white/10 px-6 py-4 text-center">
        <p className="text-white/20 font-condensed text-xs tracking-widest uppercase">
          © {new Date().getFullYear()} Simulador VR
        </p>
      </footer>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D0008] flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-[#E50014]/30 border-t-[#E50014] rounded-full animate-spin" />
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
