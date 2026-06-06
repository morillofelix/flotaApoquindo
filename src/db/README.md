# Base de Datos — PostgreSQL (Integración Futura)

Esta carpeta está preparada para contener la capa de acceso a datos del proyecto.

## Estado Actual

🟡 **Pendiente de implementación** — Solo estructura preparada.

## Opciones de ORM Recomendadas

### Opción A: Drizzle ORM (Recomendado)

- TypeScript-first con inferencia de tipos
- SQL-like API, cercano al metal
- Migraciones basadas en schema
- Ligero y rápido
- Excelente soporte para edge runtime

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

Estructura sugerida:
```
src/db/
├── index.ts          # Conexión y cliente
├── schema/
│   ├── users.ts      # Tabla de usuarios
│   ├── index.ts      # Re-exports
│   └── ...
├── migrations/       # Migraciones auto-generadas
└── drizzle.config.ts # Configuración de Drizzle Kit
```

### Opción B: Prisma

- Schema declarativo (`.prisma`)
- Migraciones automáticas
- Prisma Studio (GUI)
- Gran comunidad

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

## Proveedores de PostgreSQL Recomendados

| Proveedor | Ventaja Principal | Tier Gratuito |
|-----------|-------------------|---------------|
| [Neon](https://neon.tech) | Serverless, branching | ✅ Generoso |
| [Supabase](https://supabase.com) | PostgreSQL + Auth + Realtime | ✅ |
| [Vercel Postgres](https://vercel.com/storage/postgres) | Integración nativa con Vercel | ✅ Limitado |
| [Railway](https://railway.app) | Simple, buena UX | ✅ Trial |

## Pasos de Integración Futuros

1. Elegir proveedor de PostgreSQL
2. Obtener `DATABASE_URL` y agregar a `.env.local`
3. Instalar ORM elegido
4. Definir schema inicial
5. Generar y ejecutar primera migración
6. Crear funciones de acceso a datos en esta carpeta

## Variables de Entorno Necesarias

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

> ⚠️ Nunca subas credenciales reales a Git. Usa `.env.local` (ya está en `.gitignore`).
