# Flota SaaS

Plataforma moderna de gestión inteligente construida con Next.js 15, TypeScript, Tailwind CSS y Motion.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js | 15.x | Framework React full-stack (App Router) |
| React | 19.x | UI Library |
| TypeScript | 5.x | Tipado estricto |
| Tailwind CSS | 4.x | Utility-first CSS |
| Motion | 12.x | Animaciones declarativas |

## Inicio Rápido

### Prerequisitos

- [Node.js](https://nodejs.org/) v22 LTS o superior
- [Git](https://git-scm.com/)
- npm (incluido con Node.js)

### Instalación

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd flota-saas

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local

# 4. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo con Turbopack |
| `npm run build` | Genera build de producción |
| `npm run start` | Inicia servidor de producción |
| `npm run lint` | Ejecuta ESLint |

## Estructura del Proyecto

```
src/
├── app/                # App Router — Rutas y layouts
│   ├── api/            # [Futuro] API Routes
│   ├── layout.tsx      # Layout raíz
│   ├── page.tsx        # Página Home
│   └── globals.css     # Estilos globales
│
├── components/         # Componentes reutilizables
│   ├── ui/             # Componentes atómicos (Button, etc.)
│   ├── layout/         # Estructura (Header, Footer)
│   └── sections/       # Secciones de página (Hero, Features)
│
├── features/           # [Futuro] Módulos de negocio
├── hooks/              # Custom React hooks
├── lib/                # Constantes y configuración
├── services/           # [Futuro] Servicios externos
├── types/              # Tipos TypeScript globales
├── utils/              # Funciones utilitarias
├── db/                 # [Futuro] Capa de base de datos
└── actions/            # [Futuro] Server Actions
```

### Convenciones

- **`components/`** → UI reutilizable, dividido por nivel (ui, layout, sections)
- **`features/`** → Módulos de negocio por dominio (auth, dashboard, billing)
- **`lib/`** → Configuración y constantes del proyecto
- **`utils/`** → Funciones puras sin side effects
- **`hooks/`** → Custom hooks de React
- **`types/`** → Interfaces y tipos globales
- **`actions/`** → Server Actions de Next.js
- **`db/`** → Esquemas, conexión y queries

## Despliegue en Vercel

### Método Recomendado

1. Subir el código a un repositorio en **GitHub**
2. Ir a [vercel.com/new](https://vercel.com/new)
3. Importar el repositorio
4. Vercel auto-detecta Next.js — no se necesita configuración manual
5. Agregar variables de entorno en **Settings → Environment Variables**
6. Deploy automático en cada push a `main`

### Variables de Entorno en Vercel

```
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app
```

### Dominio Custom

1. Ve a **Settings → Domains** en tu proyecto de Vercel
2. Agrega tu dominio
3. Configura los DNS según las instrucciones de Vercel

## Roadmap de Integraciones Futuras

- [ ] **PostgreSQL** — Base de datos (ver `src/db/README.md`)
- [ ] **Autenticación** — NextAuth.js / Auth.js
- [ ] **Payments** — Stripe
- [ ] **Email** — Resend
- [ ] **Storage** — Vercel Blob / Cloudflare R2
- [ ] **Analytics** — Vercel Analytics / PostHog

## Licencia

Privado — Todos los derechos reservados.
