"use client";

import { normalizeVehicleNumber } from "@/lib/driver-owners";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type DriverLookupResult = {
  vehicleNumber: string;
  fullName: string;
  email: string;
  phone: string;
};

type VehicleNumberLookupFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: DriverLookupResult) => void;
  onBlur?: () => void;
  error?: string;
  touched?: boolean;
  fieldStatusClass: string;
};

const MAX_MOBILE_DIGITS = 4;

export default function VehicleNumberLookupField({
  value,
  onChange,
  onSelect,
  onBlur,
  error,
  touched,
  fieldStatusClass,
}: VehicleNumberLookupFieldProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<DriverLookupResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const fetchResults = useCallback(async (query: string, exact = false) => {
    const digits = query.replace(/\D/g, "");
    if (!digits) {
      setResults([]);
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: digits,
        ...(exact ? { exact: "true" } : {}),
      });
      const response = await fetch(`/api/driver-owners/lookup?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("lookup failed");
      }

      const data = (await response.json()) as { results?: DriverLookupResult[] };
      return data.results ?? [];
    } catch {
      setResults([]);
      return [];
    }
  }, []);

  useEffect(() => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchResults(digits).then((nextResults) => {
        setResults(nextResults.slice(0, 5));
        setIsOpen(nextResults.length > 1);
        setActiveIndex(-1);
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchResults, value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function applySelection(result: DriverLookupResult) {
    onSelect(result);
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  async function handleBlur() {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      onBlur?.();
      return;
    }

    const normalized = normalizeVehicleNumber(digits);
    if (normalized !== value) {
      onChange(normalized);
    }

    const exactResults = await fetchResults(digits, true);
    const match = exactResults[0];
    if (match) {
      applySelection(match);
    }

    onBlur?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) =>
        currentIndex >= results.length - 1 ? 0 : currentIndex + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) =>
        currentIndex <= 0 ? results.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) {
        applySelection(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-[#173b68]">Número de móvil</span>
        <div className="relative w-[7.5rem]">
          <input
            type="text"
            inputMode="numeric"
            name="vehicleNumber"
            required
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={value}
            onBlur={() => {
              void handleBlur();
            }}
            onFocus={() => {
              if (results.length > 1) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            onChange={(event) => {
              onChange(event.target.value.replace(/\D/g, "").slice(0, MAX_MOBILE_DIGITS));
            }}
            placeholder="001"
            className={`h-10 w-full rounded-xl border border-[#9fb8d9] bg-white px-3 text-center text-sm font-semibold tracking-wide text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatusClass}`}
          />

          {isOpen && results.length > 1 ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute left-0 top-[calc(100%+0.25rem)] z-20 min-w-[12rem] overflow-hidden rounded-xl border border-[#b7cce4] bg-white py-1 shadow-md shadow-slate-300/30"
            >
              {results.map((result, index) => (
                <li key={result.vehicleNumber} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySelection(result)}
                    className={`flex w-full items-center gap-2 border-b border-[#d9e6f3] px-3 py-2 text-left text-xs transition last:border-b-0 hover:bg-[#f8fbff] ${
                      activeIndex === index ? "bg-[#f8fbff]" : ""
                    }`}
                  >
                    <span className="font-semibold text-[#0b5cab]">
                      {result.vehicleNumber}
                    </span>
                    <span className="truncate text-slate-600">{result.fullName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>

      {touched && error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
