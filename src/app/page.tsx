"use client";

import { type FormEvent, useMemo, useState } from "react";

type FormValues = {
  driverName: string;
  vehicleNumber: string;
  appointmentDate: string;
  appointmentReason: string;
  email: string;
  phone: string;
};

type FieldName = keyof FormValues;

const initialValues: FormValues = {
  driverName: "",
  vehicleNumber: "",
  appointmentDate: "",
  appointmentReason: "",
  email: "",
  phone: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getTodayValue() {
  return new Date().toISOString().split("T")[0] ?? "";
}

function validateField(name: FieldName, value: string, today: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "Este campo es obligatorio.";
  }

  if (name === "driverName" && trimmedValue.length < 3) {
    return "Ingresa el nombre completo del conductor.";
  }

  if (name === "vehicleNumber" && !/^[a-zA-Z0-9-]{1,12}$/.test(trimmedValue)) {
    return "Usa solo letras, números o guion. Máximo 12 caracteres.";
  }

  if (name === "appointmentDate" && trimmedValue < today) {
    return "La fecha debe ser hoy o posterior.";
  }

  if (name === "appointmentReason" && trimmedValue.length < 10) {
    return "Describe el motivo con al menos 10 caracteres.";
  }

  if (name === "email" && !emailPattern.test(trimmedValue)) {
    return "Ingresa un correo válido.";
  }

  if (name === "phone") {
    const digitCount = trimmedValue.replace(/\D/g, "").length;

    if (digitCount < 8 || digitCount > 12) {
      return "Ingresa un teléfono válido entre 8 y 12 dígitos.";
    }
  }

  return "";
}

export default function HomePage() {
  const today = useMemo(() => getTodayValue(), []);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [showSuccess, setShowSuccess] = useState(false);

  const errors = useMemo(() => {
    return {
      driverName: validateField("driverName", values.driverName, today),
      vehicleNumber: validateField(
        "vehicleNumber",
        values.vehicleNumber,
        today,
      ),
      appointmentDate: validateField(
        "appointmentDate",
        values.appointmentDate,
        today,
      ),
      appointmentReason: validateField(
        "appointmentReason",
        values.appointmentReason,
        today,
      ),
      email: validateField("email", values.email, today),
      phone: validateField("phone", values.phone, today),
    };
  }, [today, values]);

  const isFormValid = Object.values(errors).every((error) => !error);

  function updateField(name: FieldName, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setShowSuccess(false);
  }

  function markFieldAsTouched(name: FieldName) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [name]: true,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setTouched({
      driverName: true,
      vehicleNumber: true,
      appointmentDate: true,
      appointmentReason: true,
      email: true,
      phone: true,
    });
    setShowSuccess(isFormValid);
  }

  function fieldStatus(name: FieldName) {
    return touched[name] && errors[name] ? "border-red-400" : "border-[#d8e2ef]";
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f4f7fb] px-5 py-10 text-[#0f2747] sm:px-8 lg:px-10">
      <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch">
        <aside className="flex flex-col rounded-[28px] bg-[#062b5f] p-7 text-white shadow-xl shadow-slate-300/60 sm:p-9">
          <div className="mb-14 inline-flex w-fit rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">
            Transportes Apoquindo
          </div>

          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9ec5ff]">
              Solicitud de cita
            </p>
            <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Agenda la atención del móvil
            </h1>
            <p className="text-base leading-7 text-blue-50/85">
              Registra los datos del conductor, el vehículo y la fecha requerida
              para preparar la solicitud. Esta vista solo valida la información,
              no realiza envío.
            </p>
          </div>

          <div className="mt-auto grid gap-4 border-t border-white/15 pt-6 text-sm text-blue-50/85">
            <p>Servicio corporativo seguro, confiable y profesional.</p>
            <p>Campos obligatorios con validación antes de continuar.</p>
          </div>
        </aside>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="rounded-[28px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:p-8"
        >
          <div className="mb-7 border-b border-[#e3ebf5] pb-6">
            <h2 className="font-heading text-2xl font-semibold text-[#0f2747]">
              Datos de la cita
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Completa todos los campos para validar la solicitud.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Nombre del conductor
              </span>
              <input
                type="text"
                name="driverName"
                value={values.driverName}
                onBlur={() => markFieldAsTouched("driverName")}
                onChange={(event) => updateField("driverName", event.target.value)}
                placeholder="Ej: Juan Pérez"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("driverName")}`}
              />
              {touched.driverName && errors.driverName ? (
                <span className="text-sm text-red-600">{errors.driverName}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Número de móvil
              </span>
              <input
                type="text"
                name="vehicleNumber"
                value={values.vehicleNumber}
                onBlur={() => markFieldAsTouched("vehicleNumber")}
                onChange={(event) =>
                  updateField("vehicleNumber", event.target.value)
                }
                placeholder="Ej: 128"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("vehicleNumber")}`}
              />
              {touched.vehicleNumber && errors.vehicleNumber ? (
                <span className="text-sm text-red-600">
                  {errors.vehicleNumber}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Fecha requerida
              </span>
              <input
                type="date"
                name="appointmentDate"
                value={values.appointmentDate}
                min={today}
                onBlur={() => markFieldAsTouched("appointmentDate")}
                onChange={(event) =>
                  updateField("appointmentDate", event.target.value)
                }
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("appointmentDate")}`}
              />
              {touched.appointmentDate && errors.appointmentDate ? (
                <span className="text-sm text-red-600">
                  {errors.appointmentDate}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Correo electrónico
              </span>
              <input
                type="email"
                name="email"
                value={values.email}
                onBlur={() => markFieldAsTouched("email")}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="correo@ejemplo.com"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("email")}`}
              />
              {touched.email && errors.email ? (
                <span className="text-sm text-red-600">{errors.email}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Número telefónico
              </span>
              <input
                type="tel"
                name="phone"
                value={values.phone}
                onBlur={() => markFieldAsTouched("phone")}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="Ej: +56 9 1234 5678"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("phone")}`}
              />
              {touched.phone && errors.phone ? (
                <span className="text-sm text-red-600">{errors.phone}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Motivos de la cita
              </span>
              <textarea
                name="appointmentReason"
                value={values.appointmentReason}
                onBlur={() => markFieldAsTouched("appointmentReason")}
                onChange={(event) =>
                  updateField("appointmentReason", event.target.value)
                }
                placeholder="Describe brevemente el motivo de la solicitud"
                rows={5}
                className={`resize-none rounded-2xl border bg-white px-4 py-3 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("appointmentReason")}`}
              />
              {touched.appointmentReason && errors.appointmentReason ? (
                <span className="text-sm text-red-600">
                  {errors.appointmentReason}
                </span>
              ) : null}
            </label>
          </div>

          {showSuccess ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              Los datos están completos y con formato válido. El envío aún no
              está habilitado.
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-4 border-t border-[#e3ebf5] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Este botón solo valida los campos por ahora.
            </p>
            <button
              type="submit"
              className="flex h-12 min-w-44 shrink-0 items-center justify-center whitespace-nowrap rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              Validar solicitud
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
