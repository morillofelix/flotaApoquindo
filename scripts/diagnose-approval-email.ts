import { PrismaClient } from "@prisma/client";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
  isNotificaSmtpConfigured,
} from "../src/lib/notifica-smtp";
import { toAppointment, toReasonConfig } from "../src/lib/appointments-mapper";

const prisma = new PrismaClient();

import { isDecisionEmailPayload } from "../src/lib/appointment-decision-email-server";

async function main() {
  const vehicle = process.argv[2]?.trim() || "9";

  console.log("=== SMTP config ===");
  const smtp = getNotificaSmtpConfig();
  console.log("configured:", isNotificaSmtpConfigured());
  if (smtp) {
    console.log("host:", smtp.host);
    console.log("port:", smtp.port);
    console.log("user:", smtp.auth.user);
    console.log("from:", smtp.from);
    console.log("pass set:", smtp.auth.pass.length > 0);
  } else {
    console.log("MISSING: host/user/pass/from — approval emails will fail with 500");
  }

  if (smtp) {
    console.log("\n=== SMTP verify (465) ===");
    try {
      const transporter = createNotificaTransporter();
      await transporter.verify();
      console.log("verify: OK");
    } catch (error) {
      console.log("verify: FAILED");
      console.log(error instanceof Error ? error.message : error);
    }

    console.log("\n=== SMTP verify (587 STARTTLS) ===");
    try {
      const nodemailer = await import("nodemailer");
      const transporter587 = nodemailer.createTransport({
        host: smtp.host,
        port: 587,
        secure: false,
        auth: smtp.auth,
        connectionTimeout: 12_000,
        greetingTimeout: 12_000,
        socketTimeout: 12_000,
      });
      await transporter587.verify();
      console.log("verify 587: OK");
    } catch (error) {
      console.log("verify 587: FAILED");
      console.log(error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n=== Latest appointments for mobile ${vehicle} ===`);
  let rows = await prisma.appointment.findMany({
    where: {
      OR: [
        { vehicleNumber: vehicle },
        { vehicleNumber: `M-${vehicle}` },
        { vehicleNumber: { contains: vehicle } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (rows.length === 0) {
    console.log("No appointments for that mobile. Showing 5 most recent overall:");
    rows = await prisma.appointment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  }

  if (rows.length === 0) {
    console.log("No appointments in database.");
    return;
  }

  for (const row of rows) {
    const reasonRecord = await prisma.appointmentReason.findUnique({
      where: { value: row.appointmentReason },
    });
    const reason = toReasonConfig(reasonRecord);
    const appointment = toAppointment(row, reason ?? undefined);

    console.log("\n---");
    console.log("ticket:", appointment.ticketNumber);
    console.log("vehicle:", appointment.vehicleNumber);
    console.log("status:", appointment.status);
    console.log("reason:", appointment.appointmentReason, appointment.appointmentReasonLabel);
    console.log("email:", appointment.email || "(empty)");
    console.log("permitType:", appointment.permitType || "(empty)");
    console.log("reasonUsesPermitDetails:", appointment.reasonUsesPermitDetails);
    console.log("payload valid for send-approval-email:", isDecisionEmailPayload(appointment));

    const missing: string[] = [];
    for (const key of [
      "permitType",
      "permitStartDate",
      "permitEndDate",
      "permitDate",
      "permitStartTime",
      "permitEndTime",
      "vacationStartDate",
      "vacationEndDate",
      "swapFromDate",
      "swapToDate",
      "email",
      "phone",
    ] as const) {
      const val = appointment[key];
      if (typeof val !== "string") missing.push(`${key}=${String(val)}`);
    }
    if (missing.length) console.log("non-string fields:", missing.join(", "));
    if (!appointment.email.trim()) console.log("WARN: empty recipient email");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
