# ⛽ Cross-Station: Sistema de Suministro e Inventario de Combustible

**Universidad Nacional Experimental de Guayana (UNEG)**  
**Asignatura:** Ingeniería de Software I (CIVA 2026)  
**Profesora:** Ing. Dubraska Roca  
**Desarrollador:** WuLliBer Yepez  

---

## 📌 Descripción del Proyecto
Cross-Station es una plataforma web orientada a mitigar las pérdidas operativas en estaciones de servicio. El sistema resuelve tres problemáticas críticas del dominio: desabastecimiento por mala proyección, cuellos de botella en la recepción de cisternas y mermas por fugas invisibles o bombas descalibradas.

---

## 🛠️ Tecnologías Utilizadas
- **Frontend:** Next.js (App Router) + Tailwind CSS
- **Backend (BaaS):** Supabase (Autenticación + API REST)
- **Base de Datos:** PostgreSQL
- **Inteligencia Artificial:** Modelo `nvidia/llama3-chatqa-1.5-70b` (Vía API REST)
- **Automatización:** n8n (Webhooks + SMTP Email)
- **Deploy:** Vercel

---

## 🏗️ Arquitectura del Sistema
El proyecto opera bajo un modelo de servicios desacoplados:
1. **Capa de Presentación:** Interfaz React (Next.js) que consume el SDK de Supabase para la mutación de datos y renderiza métricas en tiempo real.
2. **Capa de Persistencia:** Base de datos relacional (PostgreSQL) con integridad referencial estricta. Utiliza `DECIMAL(10,2)` para cálculos volumétricos exactos y políticas RLS (*Row Level Security*) para aislar los privilegios entre Operadores y Gerentes.
3. **Capa de Inferencia (IA):** Endpoint en Next.js que inyecta variables físicas (capacidad, inventario, ritmo de venta) en un *System Prompt* estructurado para obtener un objeto JSON determinista con proyecciones de abastecimiento.
4. **Capa de Orquestación (n8n):** Flujo asíncrono activado por Webhooks que extrae cierres de caja y despacha auditorías por correo electrónico.

---

## 📁 Estructura del Proyecto

```plaintext
Cross-Station/
├── app/
│   ├── api/
│   │   └── proyeccion/
│   │       └── route.js       # Inferencia con IA NVIDIA NIM (Llama 3 70B)
│   ├── globals.css            # Estilos globales y utilidades de diseño
│   ├── layout.js              # Layout raíz de Next.js App Router
│   └── page.js                # Dashboard y vista operativa de pista
├── components/
│   └── DashboardGerente.jsx   # Componente visual del panel de gerencia
├── docs/
│   └── database_schema.sql    # Script DDL de PostgreSQL para Supabase
├── lib/
│   └── supabase.js            # Inicialización del cliente Supabase
├── BD.sql                     # Script DDL de respaldo
├── .env.local                 # Variables de entorno locales (git-ignored)
├── jsconfig.json              # Configuración de alias (@/*)
├── next.config.mjs            # Configuración de Next.js
├── package.json               # Dependencias y scripts del proyecto
└── README.md                  # Documentación del sistema
```

---

## ⚙️ Setup (Instalación Local)

### 1. Clonar el repositorio
```bash
git clone https://github.com/AveRyCarNey/Cross-Station.git
cd Cross-Station
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env.local` en la raíz del proyecto y añade tus credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
NVIDIA_API_KEY=tu_api_key_de_nvidia
```

### 4. Inicializar la Base de Datos
Ejecuta el script SQL principal (`database_schema.sql`) ubicado en la carpeta `/docs` directamente en el SQL Editor de tu proyecto en Supabase para crear las tablas, roles y el inventario base.

### 5. Ejecutar el servidor de desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

---

## 🤖 Uso de Inteligencia Artificial
El sistema integra LLaMA3 de NVIDIA para proyectar días de autonomía. Mediante la técnica de Zero-Shot Prompting con restricción de formato de salida, se obliga al LLM a devolver un JSON puro. Esto minimiza el consumo de tokens (configurado con `max_tokens: 300` y `temperature: 0.1`) y permite que la aplicación parsee la sugerencia matemática de compra sin errores de formato.

### Endpoint de Inferencia IA
- **Ruta:** `POST /api/proyeccion`
- **Modelo:** `nvidia/llama3-chatqa-1.5-70b`
- **Payload:**
```json
{
  "capacidad_maxima": 10000,
  "nivel_actual": 3500,
  "ventas_promedio": 1200,
  "tipo_combustible": "Gasolina"
}
```
- **Respuesta:**
```json
{
  "proyeccion": {
    "dias_autonomia": 2.9,
    "volumen_sugerido_litros": 6500,
    "justificacion": "Nivel actual cubre menos de 3 días operativos al ritmo promedio reportado."
  }
}
```
