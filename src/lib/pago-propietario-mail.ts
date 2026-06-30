import nodemailer from "nodemailer";

export type PagoPropietarioMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
};

export function getPagoPropietarioSmtpConfig(): PagoPropietarioMailConfig | null {
  const host = (process.env.PAGO_SMTP_HOST ?? "").trim();
  const port = Number((process.env.PAGO_SMTP_PORT ?? "465").trim());
  const user = (process.env.PAGO_SMTP_USER ?? "").trim();
  const pass = (process.env.PAGO_SMTP_PASSWORD ?? "").trim();
  const from = (process.env.PAGO_EMAIL_FROM ?? user).trim();

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

export function isPagoPropietarioMailConfigured() {
  return getPagoPropietarioSmtpConfig() !== null;
}

export function createPagoPropietarioMailTransporter() {
  const smtp = getPagoPropietarioSmtpConfig();

  if (!smtp) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
}
