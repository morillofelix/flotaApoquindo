export function extractSearchDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isDigitOnlySearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }

  return /^\d+$/.test(trimmed);
}

export function matchesVehicleNumberSearch(
  vehicleNumber: string,
  query: string,
) {
  const queryDigits = extractSearchDigits(query);
  if (!queryDigits) {
    return false;
  }

  const vehicleDigits = extractSearchDigits(vehicleNumber);
  if (!vehicleDigits) {
    return false;
  }

  return vehicleDigits.includes(queryDigits);
}

export function matchesTextSearch(value: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return value.toLowerCase().includes(normalizedQuery);
}
