import { redirect } from "next/navigation";

/** Patrones quedó fuera del flujo operativo: el turno define Lun–Dom. */
export default function PatronesRedirectPage() {
  redirect("/agendamientos/turnos");
}
