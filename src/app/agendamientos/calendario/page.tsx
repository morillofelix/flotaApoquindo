"use client";

import AppointmentsCalendar from "@/components/agendamientos/AppointmentsCalendar";
import {
  type Appointment,
  defaultExecutives,
} from "@/lib/appointments";
import { loadAppointments, loadExecutives } from "@/lib/agendamientos-admin";
import { useEffect, useState } from "react";

export default function CalendarioPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [executives, setExecutives] = useState(defaultExecutives);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setError("");

    Promise.all([loadAppointments(), loadExecutives()])
      .then(([loadedAppointments, loadedExecutives]) => {
        setAppointments(loadedAppointments);
        setExecutives(loadedExecutives);
      })
      .catch(() => {
        setError("No se pudo cargar el calendario de citas.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <AppointmentsCalendar
          appointments={appointments}
          executives={executives}
          isLoading={isLoading}
        />
      </section>
    </main>
  );
}
