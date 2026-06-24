export const PERMANENT_PASSWORD_MIN_LENGTH = 6;
export const PERMANENT_PASSWORD_MAX_LENGTH = 32;
const PERMANENT_PASSWORD_PATTERN = /^[A-Za-z0-9]+$/;

export const PERMANENT_PASSWORD_REQUIREMENTS_HINT =
  "La clave definitiva debe ser alfanumérica, tener al menos 6 caracteres, incluir al menos una mayúscula y no usar caracteres especiales.";

export const PERMANENT_PASSWORD_EMAIL_LINES = [
  "Al ingresar deberás crear una clave definitiva con estos requisitos:",
  "• Alfanumérica (solo letras y números)",
  "• Mínimo 6 caracteres",
  "• Al menos una letra mayúscula",
  "• Sin caracteres especiales",
];

export function validatePermanentPassword(password: string) {
  const value = password.trim();

  if (value.length < PERMANENT_PASSWORD_MIN_LENGTH) {
    return `La clave debe tener al menos ${PERMANENT_PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (value.length > PERMANENT_PASSWORD_MAX_LENGTH) {
    return `La clave no puede superar ${PERMANENT_PASSWORD_MAX_LENGTH} caracteres.`;
  }

  if (!PERMANENT_PASSWORD_PATTERN.test(value)) {
    return "La clave debe ser alfanumérica, sin caracteres especiales.";
  }

  if (!/[A-Z]/.test(value)) {
    return "La clave debe incluir al menos una letra mayúscula.";
  }

  return null;
}
