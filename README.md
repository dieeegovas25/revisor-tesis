# 📝 Revisor de Tesis

**Plataforma inteligente de revisión y evaluación de tesis universitarias**

Utiliza IA generativa (Gemini), embeddings vectoriales, detección de plagio y validación de citas para automatizar y optimizar el proceso de evaluación académica.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Uso](#-uso)
- [Módulos del Sistema](#-módulos-del-sistema)
- [Variables de Entorno](#-variables-de-entorno)
- [Roles de Usuario](#-roles-de-usuario)
- [Contribución](#-contribución)
- [Licencia](#-licencia)

---

## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🤖 **Revisión con IA** | Análisis automático de estructura, contenido, formato, gramática y coherencia usando Gemini 2.5 Flash |
| 🔍 **Detección de Plagio** | Comparación vectorial entre documentos usando embeddings locales (Nomic Embed Text v1) y Qdrant |
| 📚 **Validación de Citas** | Verificación automática de referencias bibliográficas contra CrossRef API |
| 📐 **Patrones/Rúbricas** | Constructor de plantillas de evaluación con estructura jerárquica de capítulos y secciones |
| 👨‍🏫 **Loop de Retroalimentación** | Ciclo asesor ↔ IA donde el asesor corrige hallazgos para mejorar futuras evaluaciones |
| 📊 **Dashboard Analytics** | Métricas en tiempo real: documentos evaluados, hallazgos por severidad, distribución de categorías |
| 🔔 **Notificaciones** | Alertas automáticas para deadlines, revisiones completadas y feedback del asesor |
| 📱 **App Móvil** | Aplicación React Native con Expo para consulta de hallazgos en tiempo real |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTES                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Next.js Web │  │ Expo Mobile  │  │   REST API   │  │
│  │  (Port 3000) │  │              │  │  Consumers   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│                  NestJS API (Port 3001)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │   Auth   │ │Documents │ │ Patterns │ │  Plagiarism │ │
│  │  Module  │ │  Module  │ │  Module  │ │   Module   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Citations │ │  Review  │ │  Thesis  │ │ Dashboard  │ │
│  │  Module  │ │  Module  │ │  Module  │ │   Module   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  BullMQ      │ │  Prisma  │ │    MinIO      │
│  Workers     │ │  MySQL 8 │ │ (S3 Storage)  │
│  ┌─────────┐ │ └──────────┘ └──────────────┘
│  │Embeddings│ │
│  │Gemini AI │ │       ┌──────────────┐
│  │Plagiarism│ │───────│   Qdrant     │
│  │CrossRef  │ │       │ (Vector DB)  │
│  │Deadline  │ │       └──────────────┘
│  │Notificat.│ │
│  └─────────┘ │       ┌──────────────┐
└──────────────┘───────│    Redis 7   │
                       │  (Job Queue) │
                       └──────────────┘
```

---

## 🛠 Stack Tecnológico

### Backend
| Tecnología | Uso |
|-----------|-----|
| **NestJS 11** | Framework del API REST |
| **Prisma 6** | ORM y migraciones para MySQL |
| **BullMQ 5** | Colas de trabajo asíncronas |
| **Passport JWT** | Autenticación con tokens |
| **pdf-parse / mammoth** | Extracción de texto de PDF y DOCX |

### Frontend
| Tecnología | Uso |
|-----------|-----|
| **Next.js 15** | Framework web con App Router |
| **React 19** | Librería de UI |
| **Tailwind CSS 3** | Estilos con diseño glassmorphism |
| **Recharts** | Gráficos y visualización de datos |
| **Lucide React** | Iconografía |

### Infraestructura
| Tecnología | Uso |
|-----------|-----|
| **MySQL 8** | Base de datos transaccional principal |
| **Redis 7** | Broker de colas BullMQ |
| **MinIO** | Almacenamiento de archivos (S3 compatible) |
| **Qdrant** | Base de datos vectorial para embeddings |
| **Docker Compose** | Orquestación de servicios |
| **Turborepo** | Build system del monorepo |

### IA & ML
| Tecnología | Uso |
|-----------|-----|
| **Google Gemini 2.5 Flash** | Análisis inteligente de documentos |
| **Transformers.js** | Generación de embeddings locales |
| **Nomic Embed Text v1** | Modelo de embeddings (768 dims) |
| **CrossRef API** | Validación de citas bibliográficas |

---

## 📁 Estructura del Proyecto

```
revisor-tesis/
├── apps/
│   ├── web/                    # Frontend Next.js 15
│   │   └── src/app/
│   │       ├── dashboard/      # Páginas del dashboard
│   │       │   ├── documents/  # Gestión de documentos
│   │       │   ├── plagiarism/ # Detección de plagio
│   │       │   ├── citations/  # Validación de citas
│   │       │   ├── patterns/   # Constructor de rúbricas
│   │       │   ├── reports/    # Reportes y exportación
│   │       │   ├── projects/   # Proyectos de tesis
│   │       │   └── settings/   # Configuración
│   │       └── page.tsx        # Landing page
│   └── mobile/                 # App React Native (Expo)
│
├── packages/
│   ├── api/                    # Backend NestJS
│   │   └── src/modules/
│   │       ├── auth/           # Autenticación JWT + ORCID
│   │       ├── documents/      # Upload y procesamiento
│   │       ├── thesis/         # Gestión de proyectos
│   │       ├── review/         # Revisión y feedback
│   │       ├── plagiarism/     # Detección de plagio
│   │       ├── citations/      # Validación CrossRef
│   │       ├── patterns/       # Patrones de evaluación
│   │       ├── notifications/  # Sistema de alertas
│   │       ├── dashboard/      # Métricas y analytics
│   │       └── storage/        # MinIO service
│   │
│   ├── database/               # Prisma schema + seeds
│   │   └── prisma/
│   │       ├── schema.prisma   # 12 modelos de datos
│   │       └── seed.ts         # Datos iniciales
│   │
│   ├── workers/                # BullMQ workers
│   │   └── src/
│   │       ├── embeddings.worker.ts   # Vectorización de chunks
│   │       ├── gemini.worker.ts       # Análisis con Gemini AI
│   │       ├── plagiarism.worker.ts   # Comparación vectorial
│   │       ├── crossref.worker.ts     # Validación de citas
│   │       ├── deadline.worker.ts     # Alertas de vencimiento
│   │       └── notification.worker.ts # Push notifications
│   │
│   └── shared/                 # DTOs, constantes compartidas
│
├── docker/
│   ├── docker-compose.yml      # MySQL + Redis + MinIO + Qdrant
│   └── init/mysql-init.sql     # Script de inicialización
│
├── docs/                       # Documentación adicional
├── turbo.json                  # Configuración de Turborepo
└── package.json                # Monorepo workspaces
```

---

## 📌 Requisitos Previos

- **Node.js** ≥ 22.x
- **npm** ≥ 10.x
- **Docker** y **Docker Compose**
- **Git**

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/dieeegovas25/revisor-tesis.git
cd revisor-tesis
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores (especialmente GEMINI_API_KEY)
```

### 3. Levantar infraestructura con Docker

```bash
npm run docker:up
```

Esto inicia: MySQL 8, Redis 7, MinIO, Qdrant y crea los buckets automáticamente.

### 4. Instalar dependencias

```bash
npm install
```

### 5. Configurar la base de datos

```bash
# Generar el cliente Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:migrate

# Poblar datos iniciales (usuarios demo)
npm run db:seed
```

### 6. Iniciar en modo desarrollo

```bash
npm run dev
```

| Servicio | URL |
|----------|-----|
| 🌐 Web App | http://localhost:3000 |
| 🔌 API REST | http://localhost:3001 |
| 📦 MinIO Console | http://localhost:9001 |

---

## 💻 Uso

### Usuarios de prueba (después del seed)

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | admin@tesis.edu.pe | Admin123! |
| Coordinador | coordinador@tesis.edu.pe | Coord123! |
| Asesor | asesor@tesis.edu.pe | Asesor123! |
| Estudiante | estudiante@tesis.edu.pe | Student123! |

### Flujo típico de evaluación

```
1. Estudiante sube documento (PDF/DOCX)
     │
2. Sistema extrae texto y genera chunks
     │
3. Worker de Embeddings → vectoriza chunks en Qdrant
     │
4. Worker de Gemini → analiza estructura, contenido, formato
     │
5. Worker de Plagio → compara contra documentos existentes
     │
6. Worker de CrossRef → valida citas bibliográficas
     │
7. Se generan hallazgos con severidad y sugerencias
     │
8. Asesor revisa, aprueba o corrige hallazgos
     │
9. Correcciones alimentan el loop de retroalimentación
```

---

## 📦 Módulos del Sistema

### 🔐 Autenticación
- Login con email/contraseña (JWT)
- Refresh tokens con rotación automática
- Integración con ORCID (sandbox) para verificación académica
- Guards de roles (Admin, Coordinador, Asesor, Estudiante)

### 📄 Gestión de Documentos
- Upload de PDF y DOCX a MinIO
- Extracción automática de texto
- Chunking inteligente con overlap configurable
- Pipeline de procesamiento con estados (`UPLOADED → EXTRACTING → VECTORIZING → ANALYZING → REVIEWED`)

### 🤖 Revisión con IA (Gemini)
- Análisis por categorías: Estructura, Contenido, Formato, Citación, Gramática, Coherencia
- Severidades: Critical, Major, Minor, Info
- Puntuación sugerida en escala vigesimal (0-20)
- Rate limiting configurable (12 RPM en free tier)

### 🔍 Detección de Plagio
- Embeddings generados localmente con Transformers.js
- Almacenamiento vectorial en Qdrant
- Comparación coseno entre chunks de diferentes documentos
- Umbral de similaridad configurable

### 📚 Validación de Citas
- Extracción de citas del texto procesado por Gemini
- Consulta a CrossRef Polite Pool (gratuito)
- Matching por título, DOI, autores y año
- Estados: Verified, Partial, Not Found, Pending

### 📐 Patrones y Rúbricas
- Editor visual de estructura de tesis
- Plantillas con capítulos, secciones y reglas de formato
- Patrones por defecto configurables
- Asociación patrón → proyecto

### 👨‍🏫 Retroalimentación del Asesor
- Aceptar/rechazar hallazgos de IA
- Corregir severidad y descripción
- Notas del asesor adjuntas
- Dataset de correcciones para fine-tuning futuro

---

## 🔧 Variables de Entorno

Consultar el archivo [`.env.example`](.env.example) para la lista completa. Las principales son:

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Conexión a MySQL | ✅ |
| `GEMINI_API_KEY` | API Key de Google AI Studio | ✅ |
| `REDIS_PASSWORD` | Contraseña de Redis | ✅ |
| `MINIO_SECRET_KEY` | Secret de MinIO | ✅ |
| `JWT_SECRET` | Secret para tokens JWT | ✅ |
| `ORCID_CLIENT_ID` | Client ID de ORCID Sandbox | ⬜ |
| `CROSSREF_MAILTO` | Email para CrossRef Polite Pool | ⬜ |

---

## 👥 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **Admin** | Gestión de usuarios, configuración global, todos los módulos |
| **Coordinador** | Asignación de asesores, supervisión de proyectos, reportes |
| **Asesor** | Revisión de documentos, feedback, aprobación/rechazo |
| **Estudiante** | Subida de documentos, consulta de hallazgos, notificaciones |

---

## 🗄 Modelo de Datos

El schema incluye **12 modelos** principales:

- `User` — Usuarios con roles y perfiles ORCID
- `ThesisProject` — Proyectos de tesis (estudiante + asesor + coordinador)
- `DocumentSubmission` — Entregas de documentos con pipeline de estados
- `DocumentPattern` — Plantillas/rúbricas de evaluación
- `AiReviewJob` — Jobs de procesamiento asíncrono
- `AiReviewFinding` — Hallazgos de la revisión con IA
- `PlagiarismAlert` — Alertas de similitud entre documentos
- `CitationValidation` — Verificación de citas contra CrossRef
- `FeedbackCorrection` — Correcciones del asesor (loop de retroalimentación)
- `Notification` — Alertas y notificaciones push
- `RefreshToken` — Tokens de refresco JWT
- `OrcidProfile` — Perfiles ORCID vinculados

---
## Diagrama de datos
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       DIAGRAMA DE ENTIDAD-RELACIÓN                                    │
│                                                                                                       │
│  ┌───────────────────────┐              ┌───────────────────────┐             ┌────────────────────┐  │
│  │    especialidades     │              │       usuarios        │             │    consultas_faq   │  │
│  ├───────────────────────┤              ├───────────────────────┤             ├────────────────────┤  │
│  │ int      id (PK)      │              │ int       id (PK)     │             │ int     id (PK)    │  │
│  │ varchar  nombre       │              │ varchar   n_usuario   │(UNIQUE)     │ varchar pregunta   │  │
│  │ text     descripcion  │              │ varchar   pass_hash   │             │ text    respuesta  │  │
│  └──────────┬────────────┘              │ varchar   rol         │             │ boolean activo     │  │
│             │                           │ boolean   activo      │             └────────────────────┘  │
│             │ tiene                     │ timestamp creado_en   │                                     │
│             ▼                           └───────────┬───────────┘                                     │
│  ┌───────────────────────┐                          │                                                 │
│  │        medicos        │                          │ registra                                        │
│  ├───────────────────────┤                          ▼                                                 │
│  │ int      id (PK)      │              ┌───────────────────────┐                                     │
│  │ varchar  nombres      │              │   bitacora_auditoria  │                                     │
│  │ varchar  apellidos    │              ├───────────────────────┤                                     │
│  │ int      id_espec.(FK)│              │ int       id (PK)     │                                     │
│  │ boolean  activo       │              │ int       id_user(FK) │                                     │
│  └──────────┬────────────┘              │ varchar   accion      │                                     │
│             │                           │ text      detalle     │                                     │
│             │ atiende                   │ timestamp fecha_hora  │                                     │
│             ▼                           └───────────────────────┘                                     │
│  ┌───────────────────────┐              ┌───────────────────────┐                                     │
│  │         citas         │              │       pacientes       │                                     │
│  ├───────────────────────┤              ├───────────────────────┤                                     │
│  │ int      id (PK)      │   agenda     │ int       id (PK)     │                                     │
│  │ int      id_pac.(FK)  │◄────────────┤ varchar   dni         │(UNIQUE)                             │
│  │ int      id_med.(FK)  │             │ varchar   nombres     │                                     │
│  │ timestamp fecha_hora  │             │ varchar   apellidos   │                                     │
│  │ varchar  estado       │             │ varchar   telefono    │                                     │
│  │ timestamp creado_en   │             │ date      f_nacimiento│                                     │
│  └───────────────────────┘             │ timestamp creado_en   │                                     │
│                                         └───────────┬───────────┘                                     │
│                                                     │                                                 │
│                                                     │ inicia                                          │
│                                                     ▼                                                 │
│                                         ┌───────────────────────┐                                     │
│                                         │     conversaciones    │                                     │
│                                         ├───────────────────────┤                                     │
│                                         │ int       id (PK)     │                                     │
│                                         │ int       id_pac.(FK) │                                     │
│                                         │ timestamp fecha_inicio│                                     │
│                                         │ varchar   estado      │                                     │
│                                         └───────────┬───────────┘                                     │
│                                                     │                                                 │
│                                                     │ contiene                                        │
│                                                     ▼                                                 │
│                                         ┌───────────────────────┐                                     │
│                                         │       mensajes        │                                     │
│                                         ├───────────────────────┤                                     │
│                                         │ int       id (PK)     │                                     │
│                                         │ int       id_conv.(FK)│                                     │
│                                         │ varchar   remitente   │                                     │
│                                         │ text      contenido   │                                     │
│                                         │ timestamp fecha_hora  │                                     │
│                                         └───────────────────────┘                                     │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
---


## 🤝 Contribución

1. Fork el repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit con convención: `git commit -m "feat: descripción del cambio"`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

---

Hecho con ❤️ para la Universidad Nacional de Trujillo

**Diego Vásquez** · [dvasquezm@unitru.edu.pe](mailto:dvasquezm@unitru.edu.pe)

