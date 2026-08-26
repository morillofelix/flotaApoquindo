import { redirect } from "next/navigation";

/** Subgrupos quedó fuera del flujo: la clasificación operativa va por turno. */
export default function SubgruposRedirectPage() {
  redirect("/agendamientos/turnos");
}
