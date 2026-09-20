-- 1. TIPOS DE DATOS (ENUMS) 
CREATE TYPE rol_usuario AS ENUM ('operador', 'gerente');
CREATE TYPE estado_usuario AS ENUM ('pendiente', 'aprobado', 'suspendido');
CREATE TYPE tipo_venta AS ENUM ('unica', 'turno', 'diaria');
CREATE TYPE tipo_combustible AS ENUM ('Gasolina', 'Diesel');
CREATE TYPE metodo_pago_enum AS ENUM ('Efectivo', 'Tarjeta', 'Pago Movil', 'Vale Corporativo');

-- 2. TABLA DE USUARIOS
CREATE TABLE perfiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    nombre_completo TEXT NOT NULL,
    rol rol_usuario NOT NULL,
    estado estado_usuario DEFAULT 'pendiente',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. TABLA DE TANQUES (Inventario Físico)
CREATE TABLE tanques (
    id SERIAL PRIMARY KEY,
    codigo_tanque TEXT NOT NULL UNIQUE,
    producto tipo_combustible NOT NULL,
    capacidad_maxima DECIMAL(10,2) NOT NULL,
    volumen_actual DECIMAL(10,2) NOT NULL,
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. NUEVA: TABLA DE SURTIDORES (Mantenimiento Preventivo)
CREATE TABLE surtidores (
    id SERIAL PRIMARY KEY,
    codigo_surtidor TEXT NOT NULL UNIQUE,
    tanque_id INT REFERENCES tanques(id) NOT NULL,
    litros_acumulados DECIMAL(10,2) DEFAULT 0.00,
    umbral_mantenimiento DECIMAL(10,2) NOT NULL, -- Ej: 50000 litros para cambio de filtro
    alerta_activa BOOLEAN DEFAULT false
);

-- 5. NUEVAS: GESTIÓN DE FLOTAS
CREATE TABLE clientes_corporativos (
    id SERIAL PRIMARY KEY,
    nombre_empresa TEXT NOT NULL UNIQUE,
    limite_credito DECIMAL(10,2) NOT NULL,
    saldo_consumido DECIMAL(10,2) DEFAULT 0.00
);

CREATE TABLE vehiculos_autorizados (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES clientes_corporativos(id) NOT NULL,
    placa TEXT NOT NULL UNIQUE,
    activo BOOLEAN DEFAULT true
);

-- 6. TABLA DE CIERRES DE TURNO (Actualizada con cuadre financiero)
CREATE TABLE cierres_turno (
    id SERIAL PRIMARY KEY,
    operador_id UUID REFERENCES perfiles(id) NOT NULL,
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    total_efectivo DECIMAL(10,2) DEFAULT 0.00,
    total_tarjeta DECIMAL(10,2) DEFAULT 0.00,
    total_pago_movil DECIMAL(10,2) DEFAULT 0.00,
    total_vales DECIMAL(10,2) DEFAULT 0.00,
    estado TEXT DEFAULT 'abierto'
);

-- 7. TABLA DE VENTAS (Actualizada con finanzas y flotas)
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    operador_id UUID REFERENCES perfiles(id) NOT NULL,
    tanque_id INT REFERENCES tanques(id) NOT NULL,
    surtidor_id INT REFERENCES surtidores(id) NOT NULL,
    turno_id INT REFERENCES cierres_turno(id),
    litros_vendidos DECIMAL(10,2) NOT NULL,
    monto_cobrado DECIMAL(10,2) NOT NULL,
    metodo_pago metodo_pago_enum NOT NULL,
    vehiculo_id INT REFERENCES vehiculos_autorizados(id), -- Null si es un cliente común
    tipo tipo_venta NOT NULL,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. TABLA DE AFOROS Y FUGAS
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

-- 9. TABLA DE MANTENIMIENTOS DE TANQUES
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

-- 10. TABLA DE CONFIGURACIÓN DE AUTOMATIZACIÓN
CREATE TABLE configuracion_reportes (
    id SERIAL PRIMARY KEY,
    gerente_id UUID REFERENCES perfiles(id) UNIQUE NOT NULL,
    hora_corte_diario TIME NOT NULL,
    dia_corte_semanal INT CHECK (dia_corte_semanal BETWEEN 1 AND 7),
    hora_corte_semanal TIME NOT NULL
);