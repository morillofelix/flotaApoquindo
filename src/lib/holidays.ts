import {
  getBusinessDayAdvanceMessage,
  getEarliestRequiredDate,
  getReasonDatesToCheck,
  type ReasonStartDateInput,
} from "@/lib/appointment-reason-weekdays";

export type HolidayConfig = {
  id: string;
  date: string;
  name: string;
  year: number;
  scope: string;
  businessDaysAdvance: number;
  isActive: boolean;
  source: string;
};

export function getHolidayRestrictedMessage(requiredDays: number) {
  return getBusinessDayAdvanceMessage(requiredDays);
}

export function formatHolidayDateLabel(dateValue: string) {
  const parsed = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function getActiveHolidayDateSet(holidays: HolidayConfig[]) {
  return new Set(
    holidays.filter((holiday) => holiday.isActive).map((holiday) => holiday.date),
  );
}

export function getActiveHolidayMap(holidays: HolidayConfig[]) {
  const map = new Map<string, HolidayConfig>();

  for (const holiday of holidays) {
    if (holiday.isActive) {
      map.set(holiday.date, holiday);
    }
  }

  return map;
}

export function toHolidayConfig(value: {
  id: string;
  date: Date;
  name: string;
  year: number;
  scope: string;
  businessDaysAdvance: number;
  isActive: boolean;
  source: string;
}): HolidayConfig {
  const year = value.date.getUTCFullYear();
  const month = String(value.date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.date.getUTCDate()).padStart(2, "0");

  return {
    id: value.id,
    date: `${year}-${month}-${day}`,
    name: value.name,
    year: value.year,
    scope: value.scope,
    businessDaysAdvance: value.businessDaysAdvance,
    isActive: value.isActive,
    source: value.source,
  };
}

export function checkHolidayRestrictedDates(
  holidays: HolidayConfig[],
  input: ReasonStartDateInput & {
    vacationEndDate?: string;
    permitEndDate?: string;
  },
  ingressDate: string,
) {
  const holidayMap = getActiveHolidayMap(holidays);
  const holidayDateSet = getActiveHolidayDateSet(holidays);
  const dates = getReasonDatesToCheck(input);

  if (dates.length === 0 || holidayMap.size === 0) {
    return { blocked: false, message: "" };
  }

  for (const date of dates) {
    const holiday = holidayMap.get(date);

    if (holiday) {
      const requiredDays =
        holiday.businessDaysAdvance >= 1 ? holiday.businessDaysAdvance : 1;
      const minimumStartDate = getEarliestRequiredDate(
        ingressDate,
        requiredDays,
        holidayDateSet,
      );

      return {
        blocked: true,
        message: getHolidayRestrictedMessage(requiredDays),
        minimumStartDate,
      };
    }
  }

  return { blocked: false, message: "" };
}
