-- ==========================================================
-- ACTUALIZACIÓN: MÓDULO DE FUGAS, MEDICIÓN CON VARA Y MANTENIMIENTOS
-- ==========================================================

-- 1. Ampliar tabla aforos para registrar medidas en cm, corte de agua y tipo de operación
ALTER TABLE aforos
  ADD COLUMN IF NOT EXISTS altura_vara_cm DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS altura_agua_cm DECIMAL(6,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tipo_registro VARCHAR(30) DEFAULT 'rutina',
  ADD COLUMN IF NOT EXISTS notas TEXT;

-- Añadir restricción para tipos válidos de registro
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_tipo_registro_aforo'
    ) THEN
        ALTER TABLE aforos
        ADD CONSTRAINT check_tipo_registro_aforo
        CHECK (tipo_registro IN ('rutina', 'post_descarga', 'mantenimiento', 'calibracion', 'otro'));
    END IF;
END $$;

-- 2. Crear tabla de mantenimientos de tanques
CREATE TABLE IF NOT EXISTS mantenimientos_tanque (
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

-- 3. Índices para acelerar consultas históricas
CREATE INDEX IF NOT EXISTS idx_aforos_tanque_fecha ON aforos(tanque_id, fecha_medicion DESC);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_tanque_estado ON mantenimientos_tanque(tanque_id, estado);

-- 4. Políticas de Seguridad RLS (Row Level Security)

-- Permitir aforo con o sin usuario autenticado en desarrollo/operación
ALTER TABLE aforos ALTER COLUMN gerente_id DROP NOT NULL;
ALTER TABLE aforos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acceso total a aforos" ON aforos;
CREATE POLICY "Permitir acceso total a aforos"
  ON aforos FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para mantenimientos_tanque
ALTER TABLE mantenimientos_tanque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acceso total a mantenimientos" ON mantenimientos_tanque;
CREATE POLICY "Permitir acceso total a mantenimientos"
  ON mantenimientos_tanque FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
