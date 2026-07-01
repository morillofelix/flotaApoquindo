export type PropietarioBankConfig = {
  id: string;
  name: string;
  bankBic: string;
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
    sortOrder: number;
  },
): PropietarioBankConfig {
  return {
    id: row.id,
    name: row.name.trim(),
    bankBic: row.bankBic.trim(),
    sortOrder: row.sortOrder,
  };
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
