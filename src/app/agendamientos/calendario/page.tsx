import { redirect } from "next/navigation";

export default function CalendarioRedirectPage() {
  redirect("/agendamientos?vista=calendario");
}
