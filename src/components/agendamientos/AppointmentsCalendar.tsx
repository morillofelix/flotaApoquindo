"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
} from "@/lib/appointments";
import {
  type AppointmentCalendarEvent,
  type CalendarEventKind,
  type CalendarViewMode,
  collectCalendarEvents,
  formatLongDate,
  formatMonthYear,
  getMonthMatrix,
  getTodayIsoDate,
  groupCalendarDayEvents,
  shiftDate,
  shiftMonth,
} from "@/lib/appointment-calendar";
import { statusStyles } from "@/lib/agendamientos-appointments";
import { UI_CARD_SHELL } from "@/lib/ui-borders";
import { useEffect, useMemo, useRef, useState } from "react";

type AppointmentsCalendarProps = {
  appointments: Appointment[];
  executives: ExecutiveConfig[];
  reasons: AppointmentReasonConfig[];
  isLoading?: boolean;
};

type ReasonOption = {
  value: string;
  label: string;
};

const filterFieldClass =
  "h-10 min-w-[180px] rounded-2xl border border-[#9fb8d9] bg-white px-3 text-left text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

function CalendarReasonMultiSelect({
  options,
  selectedValues,
  onChange,
}: {
  options: ReasonOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const buttonLabel = useMemo(() => {
    if (selectedValues.length === 0) {
      return "Todos";
    }

    if (selectedValues.length === 1) {
      return (
        options.find((option) => option.value === selectedValues[0])?.label ??
        "1 motivo"
      );
    }

    return `${selectedValues.length} motivos`;
  }, [options, selectedValues]);

  function toggleReason(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((currentValue) => currentValue !== value));
      return;
    }

    onChange([...selectedValues, value]);
  }

  return (
    <div ref={containerRef} className="relative min-w-[180px]">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={`${filterFieldClass} flex w-full items-center justify-between gap-2`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="text-xs text-slate-500">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-2xl border border-[#9fb8d9] bg-white p-2 shadow-lg shadow-slate-300/30">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center rounded-xl px-2 py-2 text-left text-sm transition hover:bg-[#f8fbff] ${
              selectedValues.length === 0
                ? "bg-[#d7e7f8] font-semibold text-[#0b5cab]"
                : "text-[#0f2747]"
            }`}
          >
            Todos
          </button>

          <div className="my-1 border-t border-[#d7e7f8]" />

          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-500">
              No hay motivos disponibles.
            </p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-[#0f2747] transition hover:bg-[#f8fbff]"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => toggleReason(option.value)}
                  className="h-4 w-4 rounded border-[#9fb8d9] text-[#0b5cab] focus:ring-[#0b5cab]/20"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const weekdayHeaders = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CALENDAR_DAY_BG = "bg-[#f5ead8]";
const CALENDAR_DAY_BG_EMPTY = "bg-[#ebe3d4]";
const CALENDAR_DAY_BG_SELECTED = "bg-[#e8dcc8]";
const CALENDAR_DAY_BG_HOVER = "hover:bg-[#ebe0cf]";
const CALENDAR_HEADER_BG = "bg-[#e8dcc8]";
const CALENDAR_GRID_BORDER = "border-[#7a9fc4]";

function parseIsoDate(dateValue: string) {
  const [year = "0", month = "0", day = "0"] = dateValue.split("-");
  return {
    year: Number(year),
    month: Number(month) - 1,
    day: Number(day),
  };
}

function eventStatusClass(status: string) {
  if (status in statusStyles) {
    return statusStyles[status as keyof typeof statusStyles];
  }

  return "border-[#b7cce4] bg-[#f8fbff] text-[#173b68]";
}

function getCalendarEventStatusClass(event: AppointmentCalendarEvent) {
  if (event.kind === "approval" && event.status === "pendiente") {
    return "border-2 border-amber-600 bg-amber-200 text-amber-950 shadow-sm";
  }

  if (event.kind === "approval" && event.status === "aprobado") {
    return "border-2 border-blue-500 bg-blue-100 text-blue-950";
  }

  return eventStatusClass(event.status);
}

function getEventPresentation(event: AppointmentCalendarEvent) {
  if (event.kind === "approval") {
    const timePrefix = event.timeLabel ? `${event.timeLabel} · ` : "";
    const isPendingApproval = event.status === "pendiente";

    return {
      primary: `${event.reasonLabel} · Móv. ${event.vehicleNumber}`,
      secondary: `${timePrefix}${event.calendarStatusLabel}`,
      secondaryClassName: isPendingApproval
        ? "font-bold text-amber-950"
        : "font-semibold",
    };
  }

  return {
    primary: `${event.timeLabel} · ${event.executive}`,
    secondary: `Móv. ${event.vehicleNumber}`,
    secondaryClassName: "",
  };
}

function getGroupSubtitle(kind: CalendarEventKind, count: number) {
  if (kind === "approval") {
    return `${count} ${count === 1 ? "solicitud" : "solicitudes"} por aprobar o aprobadas`;
  }

  return `${count} ${count === 1 ? "cita" : "citas"} en el día`;
}

export default function AppointmentsCalendar({
  appointments,
  executives,
  reasons,
  isLoading = false,
}: AppointmentsCalendarProps) {
  const today = getTodayIsoDate();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [executiveFilter, setExecutiveFilter] = useState("todos");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const selectedParts = parseIsoDate(selectedDate);
  const [visibleMonth, setVisibleMonth] = useState({
    year: selectedParts.year,
    month: selectedParts.month,
  });

  const executivesByName = useMemo(
    () => new Map(executives.map((executive) => [executive.name, executive])),
    [executives],
  );

  const allEvents = useMemo(
    () => collectCalendarEvents(appointments, executivesByName),
    [appointments, executivesByName],
  );

  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      const matchesReason =
        selectedReasons.length === 0 ||
        selectedReasons.includes(event.reasonValue);
      const matchesExecutive =
        executiveFilter === "todos" ||
        (event.kind === "executive" && event.executive === executiveFilter);

      return matchesReason && matchesExecutive;
    });
  }, [allEvents, executiveFilter, selectedReasons]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, AppointmentCalendarEvent[]>();

    for (const event of filteredEvents) {
      const currentEvents = map.get(event.date) ?? [];
      currentEvents.push(event);
      map.set(event.date, currentEvents);
    }

    for (const [date, events] of map.entries()) {
      map.set(
        date,
        events.sort((left, right) => left.sortKey - right.sortKey),
      );
    }

    return map;
  }, [filteredEvents]);

  const monthCells = useMemo(
    () => getMonthMatrix(visibleMonth.year, visibleMonth.month),
    [visibleMonth.month, visibleMonth.year],
  );

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedDayGroups = groupCalendarDayEvents(selectedDayEvents);

  const reasonOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const reason of reasons) {
      options.set(reason.value, reason.label);
    }

    for (const event of allEvents) {
      if (!options.has(event.reasonValue)) {
        options.set(event.reasonValue, event.reasonLabel);
      }
    }

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "es"));
  }, [allEvents, reasons]);

  const executiveOptions = useMemo(() => {
    const names = new Set<string>();

    for (const executive of executives) {
      if (executive.isActive) {
        names.add(executive.name);
      }
    }

    for (const event of allEvents) {
      if (event.executive) {
        names.add(event.executive);
      }
    }

    return [...names].sort((left, right) => left.localeCompare(right, "es"));
  }, [allEvents, executives]);

  function openDay(dateValue: string) {
    setSelectedDate(dateValue);
    setViewMode("day");
    const parts = parseIsoDate(dateValue);
    setVisibleMonth({ year: parts.year, month: parts.month });
  }

  function goToToday() {
    const parts = parseIsoDate(today);
    setSelectedDate(today);
    setVisibleMonth({ year: parts.year, month: parts.month });
  }

  return (
    <section className={`${UI_CARD_SHELL} overflow-hidden`}>
      <div className="border-b border-[#b7cce4] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
              Visualización
            </p>
            <h2 className="mt-1 font-heading text-2xl font-semibold text-[#0f2747]">
              Calendario de citas
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Revisa por fecha las citas agendadas, el ejecutivo asignado y el
              móvil a atender.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-[#173b68]">Ejecutivo</span>
              <select
                value={executiveFilter}
                onChange={(event) => setExecutiveFilter(event.target.value)}
                className={filterFieldClass}
              >
                <option value="todos">Todos</option>
                {executiveOptions.map((executive) => (
                  <option key={executive} value={executive}>
                    {executive}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-[#173b68]">Motivo</span>
              <CalendarReasonMultiSelect
                options={reasonOptions}
                selectedValues={selectedReasons}
                onChange={setSelectedReasons}
              />
            </label>

            <div className="inline-flex rounded-2xl border border-[#9fb8d9] bg-[#f8fbff] p-1">
              {(["month", "day"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    viewMode === mode
                      ? "bg-[#0b5cab] text-white shadow-sm"
                      : "text-[#173b68] hover:bg-white"
                  }`}
                >
                  {mode === "month" ? "Mes" : "Día"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[#b7cce4] px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (viewMode === "month") {
                  setVisibleMonth((current) =>
                    shiftMonth(current.year, current.month, -1),
                  );
                  return;
                }

                setSelectedDate((current) => shiftDate(current, -1));
                const parts = parseIsoDate(shiftDate(selectedDate, -1));
                setVisibleMonth({ year: parts.year, month: parts.month });
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white text-[#173b68] transition hover:bg-[#f8fbff]"
              aria-label="Periodo anterior"
            >
              ‹
            </button>

            <p className="min-w-[220px] text-center font-heading text-lg font-semibold capitalize text-[#0f2747]">
              {viewMode === "month"
                ? formatMonthYear(visibleMonth.year, visibleMonth.month)
                : formatLongDate(selectedDate)}
            </p>

            <button
              type="button"
              onClick={() => {
                if (viewMode === "month") {
                  setVisibleMonth((current) =>
                    shiftMonth(current.year, current.month, 1),
                  );
                  return;
                }

                const nextDate = shiftDate(selectedDate, 1);
                setSelectedDate(nextDate);
                const parts = parseIsoDate(nextDate);
                setVisibleMonth({ year: parts.year, month: parts.month });
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white text-[#173b68] transition hover:bg-[#f8fbff]"
              aria-label="Periodo siguiente"
            >
              ›
            </button>
          </div>

          <button
            type="button"
            onClick={goToToday}
            className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff]"
          >
            Hoy
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6">
          Cargando calendario...
        </div>
      ) : viewMode === "month" ? (
        <div className="overflow-x-auto px-2 py-4 sm:px-4">
          <div className="min-w-[760px]">
            <div
              className={`grid grid-cols-7 border-2 ${CALENDAR_GRID_BORDER} ${CALENDAR_HEADER_BG} shadow-sm`}
            >
              {weekdayHeaders.map((weekday) => (
                <div
                  key={weekday}
                  className={`border-b-2 border-r-2 ${CALENDAR_GRID_BORDER} px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#5c4a32] last:border-r-0`}
                >
                  {weekday}
                </div>
              ))}

              {monthCells.map((dateValue, index) => {
                if (!dateValue) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className={`min-h-[120px] border-b-2 border-r-2 ${CALENDAR_GRID_BORDER} ${CALENDAR_DAY_BG_EMPTY} last:border-r-0`}
                    />
                  );
                }

                const dayEvents = eventsByDate.get(dateValue) ?? [];
                const parts = parseIsoDate(dateValue);
                const isToday = dateValue === today;
                const isSelected = dateValue === selectedDate;

                return (
                  <button
                    key={dateValue}
                    type="button"
                    onClick={() => openDay(dateValue)}
                    className={`min-h-[120px] border-b-2 border-r-2 ${CALENDAR_GRID_BORDER} p-2 text-left align-top transition last:border-r-0 ${CALENDAR_DAY_BG_HOVER} ${
                      isSelected
                        ? `${CALENDAR_DAY_BG_SELECTED} ring-2 ring-inset ring-[#0b5cab]/35`
                        : CALENDAR_DAY_BG
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold ${
                          isToday
                            ? "bg-[#0b5cab] text-white"
                            : "text-[#0f2747]"
                        }`}
                      >
                        {parts.day}
                      </span>
                      {dayEvents.length > 0 ? (
                        <span className="text-[11px] font-semibold text-[#0b5cab]">
                          {dayEvents.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const presentation = getEventPresentation(event);

                        return (
                          <div
                            key={event.id}
                            className={`rounded-md border px-1.5 py-1 text-[10px] leading-[1.25] shadow-sm ${getCalendarEventStatusClass(event)}`}
                          >
                            <p className="truncate font-semibold">
                              {presentation.primary}
                            </p>
                            <p
                              className={`truncate ${presentation.secondaryClassName}`}
                            >
                              {presentation.secondary}
                            </p>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 ? (
                        <p className="text-[11px] font-semibold text-[#0b5cab]">
                          +{dayEvents.length - 3} más
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4 sm:px-6">
          {selectedDayGroups.length === 0 ? (
            <div className={`rounded-2xl border-2 ${CALENDAR_GRID_BORDER} ${CALENDAR_DAY_BG} px-4 py-8 text-center text-sm text-[#5c4a32]`}>
              No hay citas para este día con el filtro seleccionado.
            </div>
          ) : (
            selectedDayGroups.map((group) => (
              <section
                key={group.key}
                className={`overflow-hidden rounded-2xl border-2 ${CALENDAR_GRID_BORDER} ${CALENDAR_DAY_BG} shadow-sm`}
              >
                <header className={`border-b-2 ${CALENDAR_GRID_BORDER} ${CALENDAR_HEADER_BG} px-4 py-2.5`}>
                  <h3 className="font-heading text-base font-semibold text-[#0f2747]">
                    {group.title}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {getGroupSubtitle(group.kind, group.events.length)}
                  </p>
                </header>

                <div className={`divide-y divide-[#7a9fc4] bg-[#faf4ea]`}>
                  {group.events.map((event) => (
                    <article
                      key={event.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
                    >
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${getCalendarEventStatusClass(event)}`}
                        >
                          {event.calendarStatusLabel}
                        </span>
                        <p className="min-w-0 flex-1 font-semibold text-[#0f2747]">
                          Móvil {event.vehicleNumber}
                          <span className="font-normal text-slate-600">
                            {" "}
                            · {event.driverName}
                            {group.kind === "executive" && event.timeLabel
                              ? ` · ${event.timeLabel}`
                              : ""}
                          </span>
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b5cab]">
                          {event.ticketLabel}
                        </p>
                      </article>
                    ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </section>
  );
}
