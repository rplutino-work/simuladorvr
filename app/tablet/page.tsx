"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function TabletSelectorPage() {
  const router = useRouter();
  const [puestos, setPuestos] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("simuladorvr_puesto");
    if (saved) {
      router.replace(`/tablet/${saved}`);
      return;
    }
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((data) => {
        setPuestos(data.filter?.((p: { active: boolean }) => p.active) ?? data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const selectPuesto = (id: string) => {
    localStorage.setItem("simuladorvr_puesto", id);
    router.replace(`/tablet/${id}`);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0D0008] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#E50014] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0D0008] flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="font-racing text-5xl text-white tracking-wider">
          SIMULADOR<span className="text-[#E50014]">VR</span>
        </h1>
        <p className="text-white/50 font-condensed text-lg tracking-widest mt-4 uppercase">
          Seleccioná el puesto de esta tablet
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 max-w-4xl">
        {puestos.map((p, i) => (
          <motion.button
            key={p.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => selectPuesto(p.id)}
            className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-white/10 bg-white/5 hover:border-[#E50014] hover:bg-[#E50014]/10 transition-all duration-300"
          >
            <span className="font-racing text-5xl text-white">
              {p.name.replace(/\D/g, "") || (i + 1)}
            </span>
            <span className="font-condensed text-sm text-white/50 tracking-widest mt-2 uppercase">
              {p.name}
            </span>
          </motion.button>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-white/30 text-sm mt-12 font-condensed tracking-wider"
      >
        Esta selección se recuerda automáticamente
      </motion.p>
    </div>
  );
}
