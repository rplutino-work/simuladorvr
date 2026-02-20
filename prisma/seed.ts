import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@simuladorvr.com" },
    update: {},
    create: {
      email: "admin@simuladorvr.com",
      password: hashed,
      role: "ADMIN",
    },
  });
  console.log("Admin created:", admin.email);

  const operator = await prisma.user.upsert({
    where: { email: "operador@simuladorvr.com" },
    update: {},
    create: {
      email: "operador@simuladorvr.com",
      password: await bcrypt.hash("operador123", 12),
      role: "OPERATOR",
    },
  });
  console.log("Operator created:", operator.email);

  const puestos = [
    { name: "Simulador 1", price30: 5000, price60: 9000, price120: 16000 },
    { name: "Simulador 2", price30: 5000, price60: 9000, price120: 16000 },
    { name: "Simulador 3", price30: 4500, price60: 8000, price120: 14000 },
  ];

  const count = await prisma.puesto.count();
  if (count === 0) {
    await prisma.puesto.createMany({
      data: [
        ...puestos.map((p) => ({
          name: p.name,
          price30: p.price30 * 100,
          price60: p.price60 * 100,
          price120: p.price120 * 100,
        })),
        { name: "Simulador 4", price30: 500000, price60: 900000, price120: 1600000 },
        { name: "Simulador 5", price30: 500000, price60: 900000, price120: 1600000 },
      ],
    });
    console.log("Puestos created (5)");
  }

  const settingsCount = await prisma.businessSettings.count();
  if (settingsCount === 0) {
    await prisma.businessSettings.create({
      data: {
        openHour: 10,
        closeHour: 20,
        slotInterval: 15,
        allowCancel: true,
        allowReschedule: true,
        cancelLimitHours: 24,
        negativeMarginMinutes: 0,
      },
    });
    console.log("BusinessSettings created");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
