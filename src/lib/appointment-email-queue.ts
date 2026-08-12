import { after } from "next/server";
import { type Appointment } from "@/lib/appointments";
import { sendExecutiveAssignmentEmailsServer } from "@/lib/appointment-emails-server";

export function queueExecutiveAssignmentEmails(
  appointment: Appointment,
  options?: { ownerCcEmail?: string },
) {
  after(async () => {
    const startedAt = Date.now();

    try {
      await sendExecutiveAssignmentEmailsServer(appointment, options);
      console.info(
        `[email] executive assignment completed in ${Date.now() - startedAt}ms for ${appointment.id}`,
      );
    } catch (error) {
      console.error(
        `[email] executive assignment failed after ${Date.now() - startedAt}ms for ${appointment.id}:`,
        error,
      );
    }
  });
}
