"use client";

import { scrollNativePickerIntoView } from "@/lib/form-scroll";

type TimeSelectFieldProps = {
  name?: string;
  value: string;
  required?: boolean;
  className?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseClock(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return { hour: "", minute: "" };
  }

  return { hour: match[1], minute: match[2] };
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => pad2(index));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => pad2(index));

const selectClassName =
  "h-12 w-full min-w-0 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

/**
 * Mobile-safe time picker using selects (avoids Android native dialog overflow).
 * Desktop keeps native type="time".
 */
export default function TimeSelectField({
  name,
  value,
  required = false,
  className = "",
  onBlur,
  onChange,
}: TimeSelectFieldProps) {
  const { hour, minute } = parseClock(value);

  function commit(nextHour: string, nextMinute: string) {
    if (!nextHour || !nextMinute) {
      onChange("");
      return;
    }

    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Hora
          </span>
          <select
            name={name ? `${name}-hour` : undefined}
            required={required}
            value={hour}
            onBlur={onBlur}
            onChange={(event) => commit(event.target.value, minute || "00")}
            className={`${selectClassName} ${className}`}
          >
            <option value="">—</option>
            {HOUR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Minuto
          </span>
          <select
            name={name ? `${name}-minute` : undefined}
            required={required}
            value={minute}
            onBlur={onBlur}
            onChange={(event) => commit(hour || "00", event.target.value)}
            className={`${selectClassName} ${className}`}
          >
            <option value="">—</option>
            {MINUTE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        type="time"
        name={name}
        required={required}
        value={value}
        onFocus={scrollNativePickerIntoView}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className={`hidden scroll-mt-28 sm:block ${selectClassName} sm:px-4 ${className}`}
      />
    </>
  );
}
