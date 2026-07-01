export type PropietarioBankConfig = {
  id: string;
  name: string;
  bankBic: string;
  isActive: boolean;
  sortOrder: number;
};

export function normalizePropietarioBankName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toPropietarioBank(
  row: {
    id: string;
    name: string;
    bankBic: string;
    isActive: boolean;
    sortOrder: number;
  },
): PropietarioBankConfig {
  return {
    id: row.id,
    name: row.name.trim(),
    bankBic: row.bankBic.trim(),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export function sortPropietarioBanks(banks: PropietarioBankConfig[]) {
  return [...banks].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
  });
}

export function getActivePropietarioBanks(banks: PropietarioBankConfig[]) {
  return banks.filter((bank) => bank.isActive);
}

export function formatPropietarioBankOption(bank: PropietarioBankConfig) {
  const code = bank.bankBic.trim();

  if (code) {
    return `${bank.name} (${code})`;
  }

  return bank.name;
}

export function findPropietarioBankForSelection(
  banks: PropietarioBankConfig[],
  bankName: string,
  bankBic: string,
) {
  const normalizedName = normalizePropietarioBankName(bankName);
  const normalizedBic = bankBic.trim();

  return (
    banks.find(
      (bank) =>
        normalizePropietarioBankName(bank.name) === normalizedName &&
        bank.bankBic.trim() === normalizedBic,
    ) ??
    banks.find(
      (bank) => normalizePropietarioBankName(bank.name) === normalizedName,
    ) ??
    null
  );
}
