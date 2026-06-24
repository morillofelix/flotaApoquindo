"use client";

import {
  type Appointment,
  type ExecutiveConfig,
} from "@/lib/appointments";
import {
  type AppointmentCalendarEvent,
  type CalendarViewMode,
  collectCalendarEvents,
  formatLongDate,
  formatMonthYear,
  getMonthMatrix,
  getTodayIsoDate,
  groupEventsByExecutive,
  shiftDate,
  shiftMonth,
} from "@/lib/appointment-calendar";
import { statusLabels, statusStyles } from "@/lib/agendamientos-appointments";
import { UI_CARD_SHELL } from "@/lib/ui-borders";
import { useMemo, useState } from "react";

type AppointmentsCalendarProps = {
  appointments: Appointment[];
  executives: ExecutiveConfig[];
  isLoading?: boolean;
};

const weekdayHeaders = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseIsoDate(dateValue: string) {
  const [year = "0", month = "0", day = "0"] = dateValue.split("-");
  return {
    year: Number(year),
    month: Number(month) - 1,
    day: Number(day),
  };
}

function eventStatusLabel(status: string) {
  if (status in statusLabels) {
    return statusLabels[status as keyof typeof statusLabels];
  }

  return status;
}

function eventStatusClass(status: string) {
  if (status in statusStyles) {
    return statusStyles[status as keyof typeof statusStyles];
  }

  return "border-[#b7cce4] bg-[#f8fbff] text-[#173b68]";
}

export default function AppointmentsCalendar({
  appointments,
  executives,
  isLoading = false,
}: AppointmentsCalendarProps) {
  const today = getTodayIsoDate();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [executiveFilter, setExecutiveFilter] = useState("todos");
  const selectedParts = parseIsoDate(selectedDate);
  const [visibleMonth, setVisibleMonth] = useState({
    year: selectedParts.year,
    month: selectedParts.month,
  });

  const allEvents = useMemo(
    () => collectCalendarEvents(appointments),
    [appointments],
  );

  const filteredEvents = useMemo(() => {
    if (executiveFilter === "todos") {
      return allEvents;
    }

    return allEvents.filter((event) => event.executive === executiveFilter);
  }, [allEvents, executiveFilter]);

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
  const selectedDayGroups = groupEventsByExecutive(selectedDayEvents);

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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-[#173b68]">Ejecutivo</span>
              <select
                value={executiveFilter}
                onChange={(event) => setExecutiveFilter(event.target.value)}
                className="h-10 min-w-[180px] rounded-2xl border border-[#9fb8d9] bg-white px-3 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos</option>
                {executiveOptions.map((executive) => (
                  <option key={executive} value={executive}>
                    {executive}
                  </option>
                ))}
              </select>
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
            <div className="grid grid-cols-7 border border-[#b7cce4] bg-[#f8fbff]">
              {weekdayHeaders.map((weekday) => (
                <div
                  key={weekday}
                  className="border-b border-r border-[#c5d8eb] px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#173b68] last:border-r-0"
                >
                  {weekday}
                </div>
              ))}

              {monthCells.map((dateValue, index) => {
                if (!dateValue) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[120px] border-b border-r border-[#d7e7f8] bg-[#f8fbff] last:border-r-0"
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
                    className={`min-h-[120px] border-b border-r border-[#c5d8eb] p-2 text-left align-top transition last:border-r-0 hover:bg-[#f8fbff] ${
                      isSelected ? "bg-[#eef5fd] ring-1 ring-inset ring-[#0b5cab]/20" : "bg-white"
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
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={`rounded-lg border px-2 py-1 text-[11px] leading-4 ${eventStatusClass(event.status)}`}
                        >
                          <p className="font-semibold">{event.timeLabel}</p>
                          <p className="truncate">
                            {event.executive} · Móvil {event.vehicleNumber}
                          </p>
                        </div>
                      ))}
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
            <div className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-8 text-center text-sm text-slate-600">
              No hay citas para este día con el filtro seleccionado.
            </div>
          ) : (
            selectedDayGroups.map((group) => (
              <section
                key={group.executive}
                className="overflow-hidden rounded-2xl border border-[#b7cce4] bg-white"
              >
                <header className="border-b border-[#c5d8eb] bg-[#d7e7f8] px-4 py-3">
                  <h3 className="font-heading text-lg font-semibold text-[#0f2747]">
                    {group.executive}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {group.events.length}{" "}
                    {group.events.length === 1 ? "cita" : "citas"} en el día
                  </p>
                </header>

                <div className="divide-y divide-[#d7e7f8]">
                  {group.events.map((event) => (
                    <article
                      key={event.id}
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0b5cab]">
                          {event.timeLabel}
                        </p>
                        <span
                          className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${eventStatusClass(event.status)}`}
                        >
                          {eventStatusLabel(event.status)}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="font-heading text-base font-semibold text-[#0f2747]">
                          Móvil {event.vehicleNumber} · {event.driverName}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {event.reasonLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                          {event.ticketLabel}
                        </p>
                      </div>
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
