import { leasingErrorResponse, requireLeasingAccess } from "@/lib/leasing-api-server";
import { validateLeasingComprobante } from "@/lib/leasing-comprobante-server";
import { enviarNotificacionLeasing } from "@/lib/leasing-email-server";
import {
  getLeasingActor,
  getLeasingToday,
  parseRegistrarPagoForm,
  registrarPagoLeasing,
  validateRegistrarPagoInput,
} from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireLeasingAccess(request, "leasingCobros");

  if (unauthorized) {
    return unauthorized;
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "No se pudo leer el formulario. Verifica el tamaño del comprobante." },
      { status: 400 },
    );
  }

  const input = parseRegistrarPagoForm(form);
  const inputError = validateRegistrarPagoInput(input, getLeasingToday());

  if (inputError) {
    return NextResponse.json({ message: inputError }, { status: 400 });
  }

  const comprobante = await validateLeasingComprobante(form.get("comprobante"));

  if (!comprobante.ok) {
    return NextResponse.json({ message: comprobante.message }, { status: 400 });
  }

  const actor = getLeasingActor(request);

  try {
    const { id } = await context.params;
    const result = await registrarPagoLeasing(id, input, comprobante.value, actor);

    let correo = { ok: false, message: "" };

    if (result.notificacionId && !result.duplicado) {
      correo = await enviarNotificacionLeasing(result.notificacionId, actor).catch(() => ({
        ok: false,
        message: "No se pudo enviar el correo. Puedes reenviarlo desde el detalle del pago.",
      }));
    }

    return NextResponse.json(
      {
        pagoId: result.pagoId,
        duplicado: result.duplicado,
        correo,
      },
      { status: result.duplicado ? 200 : 201 },
    );
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo registrar el pago.");
  }
}
