-- 1. TIPOS DE DATOS (ENUMS) PARA CONTROLAR ENTRADAS
CREATE TYPE rol_usuario AS ENUM ('operador', 'gerente');
CREATE TYPE estado_usuario AS ENUM ('pendiente', 'aprobado', 'suspendido');
CREATE TYPE tipo_venta AS ENUM ('unica', 'turno', 'diaria');
CREATE TYPE tipo_combustible AS ENUM ('Gasolina', 'Diesel');

-- 2. TABLA DE USUARIOS (Vinculada a auth.users de Supabase)
-- Soporta los CU: Solicitar Acceso, Iniciar Sesión, Gestionar Accesos.
CREATE TABLE perfiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    nombre_completo TEXT NOT NULL,
    rol rol_usuario NOT NULL,
    estado estado_usuario DEFAULT 'pendiente',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. TABLA DE TANQUES (Inventario Físico)
-- Soporta la lógica de 4 tanques interconectados.
CREATE TABLE tanques (
    id SERIAL PRIMARY KEY,
    codigo_tanque TEXT NOT NULL UNIQUE,
    producto tipo_combustible NOT NULL,
    capacidad_maxima DECIMAL(10,2) NOT NULL,
    volumen_actual DECIMAL(10,2) NOT NULL,
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. TABLA DE CIERRES DE TURNO
-- Soporta el CU: Ejecutar Cierre de Turno.
CREATE TABLE cierres_turno (
    id SERIAL PRIMARY KEY,
    operador_id UUID REFERENCES perfiles(id) NOT NULL,
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    estado TEXT DEFAULT 'abierto'
);

-- 5. TABLA DE VENTAS (Transacciones Operativas)
-- Soporta el CU: Registrar Salida de Combustible.
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    operador_id UUID REFERENCES perfiles(id) NOT NULL,
    tanque_id INT REFERENCES tanques(id) NOT NULL,
    turno_id INT REFERENCES cierres_turno(id),
    litros_vendidos DECIMAL(10,2) NOT NULL,
    tipo tipo_venta NOT NULL,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. TABLA DE AFOROS Y FUGAS
-- Soporta los CU: Registrar Aforo Físico y Emitir Alerta de Descalibración.
CREATE TABLE aforos (
    id SERIAL PRIMARY KEY,
    gerente_id UUID REFERENCES perfiles(id) NOT NULL,
    tanque_id INT REFERENCES tanques(id) NOT NULL,
    volumen_teorico DECIMAL(10,2) NOT NULL,
    volumen_fisico_medido DECIMAL(10,2) NOT NULL,
    diferencia_detectada DECIMAL(10,2) NOT NULL,
    alerta_generada BOOLEAN DEFAULT false,
    altura_vara_cm DECIMAL(6,2),
    altura_agua_cm DECIMAL(6,2) DEFAULT 0.00,
    tipo_registro VARCHAR(30) DEFAULT 'rutina' CHECK (tipo_registro IN ('rutina', 'post_descarga', 'mantenimiento', 'calibracion', 'otro')),
    notas TEXT,
    fecha_medicion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. TABLA DE MANTENIMIENTOS DE TANQUES
CREATE TABLE mantenimientos_tanque (
    id SERIAL PRIMARY KEY,
    tanque_id INT REFERENCES tanques(id) ON DELETE CASCADE NOT NULL,
    gerente_id UUID REFERENCES perfiles(id),
    tipo VARCHAR(50) NOT NULL, -- 'purga_agua', 'limpieza_fondo', 'prueba_estanqueidad', 'calibracion_vara', 'inspeccion_valvulas', 'otro'
    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_fin TIMESTAMP WITH TIME ZONE,
    estado VARCHAR(20) DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'completado', 'cancelado')),
    tecnico_responsable VARCHAR(100),
    costo DECIMAL(10,2) DEFAULT 0.00,
    observaciones TEXT,
    bloquear_despacho BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. TABLA DE CONFIGURACIÓN DE AUTOMATIZACIÓN (Para n8n)
-- Soporta el CU: Configurar Horario de Reportes.
CREATE TABLE configuracion_reportes (
    id SERIAL PRIMARY KEY,
    gerente_id UUID REFERENCES perfiles(id) UNIQUE NOT NULL,
    hora_corte_diario TIME NOT NULL,
    dia_corte_semanal INT CHECK (dia_corte_semanal BETWEEN 1 AND 7), -- 1=Lunes, 7=Domingo
    hora_corte_semanal TIME NOT NULL
);

-- 8. PRECARGA DE DATOS BASE (Tus 4 tanques)
INSERT INTO tanques (codigo_tanque, producto, capacidad_maxima, volumen_actual) VALUES
('GAS-1A', 'Gasolina', 35000.00, 35000.00),
('GAS-1B', 'Gasolina', 35000.00, 35000.00),
('DIE-2A', 'Diesel', 40000.00, 40000.00),
('DIE-2B', 'Diesel', 40000.00, 40000.00);