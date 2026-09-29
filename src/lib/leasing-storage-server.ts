import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type StoredFileMetadata = {
  storageKey: string;
  mimeType: string;
  tamano: number;
  hash: string;
};

export interface StorageProvider {
  upload(
    input: { buffer: Buffer; mimeType: string; hash: string },
    client?: DbClient,
  ): Promise<StoredFileMetadata & { archivoId: string }>;
  getSignedUrl(storageKey: string): Promise<string>;
  getMetadata(storageKey: string): Promise<StoredFileMetadata | null>;
  read(storageKey: string): Promise<{ buffer: Buffer; mimeType: string } | null>;
  delete(storageKey: string): Promise<void>;
}

const DB_PREFIX = "db:";

function archivoIdFromKey(storageKey: string) {
  return storageKey.startsWith(DB_PREFIX) ? storageKey.slice(DB_PREFIX.length) : "";
}

/**
 * Guarda el binario en PostgreSQL (tabla LeasingArchivo), deduplicado por hash.
 * No hay URL pública: el acceso siempre pasa por la API protegida.
 */
export const databaseStorageProvider: StorageProvider = {
  async upload({ buffer, mimeType, hash }, client = prisma) {
    const archivo = await client.leasingArchivo.upsert({
      where: { hash },
      create: {
        hash,
        contenido: new Uint8Array(buffer),
        tamano: buffer.length,
        mimeType,
      },
      update: {},
      select: { id: true, tamano: true, mimeType: true, hash: true },
    });

    return {
      archivoId: archivo.id,
      storageKey: `${DB_PREFIX}${archivo.id}`,
      mimeType: archivo.mimeType,
      tamano: archivo.tamano,
      hash: archivo.hash,
    };
  },

  async getSignedUrl() {
    throw new Error("El almacenamiento en base de datos no genera URL; usa la API protegida.");
  },

  async getMetadata(storageKey) {
    const id = archivoIdFromKey(storageKey);

    if (!id) {
      return null;
    }

    const archivo = await prisma.leasingArchivo.findUnique({
      where: { id },
      select: { id: true, tamano: true, mimeType: true, hash: true },
    });

    return archivo
      ? {
          storageKey,
          mimeType: archivo.mimeType,
          tamano: archivo.tamano,
          hash: archivo.hash,
        }
      : null;
  },

  async read(storageKey) {
    const id = archivoIdFromKey(storageKey);

    if (!id) {
      return null;
    }

    const archivo = await prisma.leasingArchivo.findUnique({
      where: { id },
      select: { contenido: true, mimeType: true },
    });

    return archivo
      ? { buffer: Buffer.from(archivo.contenido), mimeType: archivo.mimeType }
      : null;
  },

  async delete() {
    throw new Error("Los comprobantes de leasing no se eliminan.");
  },
};

export function getLeasingStorageProvider(): StorageProvider {
  return databaseStorageProvider;
}
