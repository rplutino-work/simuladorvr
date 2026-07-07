const { exec } = require("child_process");

// Mapeo de Puestos a IPs de las TVs en la red local
const TVs = [
  { puestoId: "cmlsu288d0002481omf31y94i", ip: "192.168.100.30:5555", name: "TV 1" },
  { puestoId: "cmlsu288d0003481olzokle5t", ip: "192.168.100.28:5555", name: "TV 2" }
];

// Estado en memoria
const sessionState = {}; // { "1": "idle", "2": "idle" }
TVs.forEach(tv => sessionState[tv.puestoId] = "idle");

const API_BASE = "https://simuladorvr.vercel.app/api/tablet";
const POLL_INTERVAL_MS = 3000;

function runADB(ip, command) {
  return new Promise((resolve, reject) => {
    exec(`adb -s ${ip} ${command}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ADB ERROR] ${ip}: ${error.message}`);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

async function switchToPlaystation(ip) {
  console.log(`[>>] ${ip} - Cambiando a HDMI 1 (PlayStation)...`);
  // Comando específico para TCL/Mediatek
  await runADB(ip, "shell am start -a android.intent.action.VIEW -d content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW4");
}

async function switchToApp(ip) {
  console.log(`[<<] ${ip} - Volviendo a la App SimuladorVR...`);
  // Ir a inicio primero para salir del HDMI
  await runADB(ip, "shell input keyevent KEYCODE_HOME");
  // Pequeña pausa
  await new Promise(r => setTimeout(r, 1000));
  // Abrir la app
  await runADB(ip, "shell monkey -p com.simuladorvr.tablet -c android.intent.category.LAUNCHER 1");
}

async function checkStatus() {
  for (const tv of TVs) {
    try {
      const res = await fetch(`${API_BASE}/${tv.puestoId}/status`);
      if (!res.ok) continue;
      const data = await res.json();
      
      const isActive = data.session && data.session.remainingMs > 0;
      const currentState = sessionState[tv.puestoId];

      if (isActive && currentState !== "active") {
        // Sesión acaba de empezar
        sessionState[tv.puestoId] = "active";
        console.log(`\n[${tv.name}] Sesión INICIADA. Preparando TV...`);
        // Darle 3 segundos (el tiempo que dice "PREPARANDO TU SESIÓN" en la web)
        setTimeout(() => {
          switchToPlaystation(tv.ip);
        }, 3000);
      } 
      else if (!isActive && currentState === "active") {
        // Sesión acaba de terminar
        sessionState[tv.puestoId] = "finished";
        console.log(`\n[${tv.name}] Sesión FINALIZADA. Cortando TV...`);
        await switchToApp(tv.ip);
        
        // Volver a idle después de un rato
        setTimeout(() => {
          sessionState[tv.puestoId] = "idle";
        }, 5000);
      }

    } catch (err) {
      console.error(`[Fetch Error] ${tv.name}: ${err.message}`);
    }
  }
}

console.log("=========================================");
console.log("🎮 LOCAL TV CONTROLLER INICIADO 🎮");
console.log("=========================================");
console.log("Conectando a las TVs por ADB...");

// Intentamos reconectar en segundo plano
TVs.forEach(tv => exec(`adb connect ${tv.ip.replace(":5555", "")}`));

console.log("Monitoreando sesiones cada 3 segundos...");
setInterval(checkStatus, POLL_INTERVAL_MS);
checkStatus(); // primera vez inmediata
