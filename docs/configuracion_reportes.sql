-- =====================================================================
-- SCRIPT: TABLA Y POLÍTICAS PARA CONFIGURACIÓN DE REPORTES AUTOMATIZADOS
-- Ejecutar en Supabase -> SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS configuracion_reportes (
    id SERIAL PRIMARY KEY,
    gerente_id UUID REFERENCES perfiles(id),
    hora_corte_diario TIME NOT NULL DEFAULT '20:00',
    dia_corte_semanal INT CHECK (dia_corte_semanal BETWEEN 1 AND 7),
    hora_corte_semanal TIME DEFAULT '21:00',
    email_destinatario TEXT NOT NULL DEFAULT 'cross.station11@gmail.com',
    activo BOOLEAN NOT NULL DEFAULT true,
    ultimo_envio TIMESTAMP WITH TIME ZONE,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Si la tabla ya fue creada previamente con esquema base, asegurar columnas necesarias:
ALTER TABLE configuracion_reportes ADD COLUMN IF NOT EXISTS email_destinatario TEXT DEFAULT 'cross.station11@gmail.com';
ALTER TABLE configuracion_reportes ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
ALTER TABLE configuracion_reportes ADD COLUMN IF NOT EXISTS ultimo_envio TIMESTAMP WITH TIME ZONE;
ALTER TABLE configuracion_reportes ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE configuracion_reportes ALTER COLUMN gerente_id DROP NOT NULL;
ALTER TABLE configuracion_reportes ALTER COLUMN hora_corte_semanal DROP NOT NULL;

-- Habilitar Políticas de Seguridad (RLS)
ALTER TABLE configuracion_reportes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total a configuracion_reportes" ON configuracion_reportes;
CREATE POLICY "Permitir acceso total a configuracion_reportes" ON configuracion_reportes 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Insertar o asegurar registro inicial con id = 1
INSERT INTO configuracion_reportes (id, hora_corte_diario, email_destinatario, activo)
VALUES (1, '20:00', 'cross.station11@gmail.com', true)
ON CONFLICT (id) DO UPDATE SET
    email_destinatario = COALESCE(configuracion_reportes.email_destinatario, EXCLUDED.email_destinatario),
    hora_corte_diario = COALESCE(configuracion_reportes.hora_corte_diario, EXCLUDED.hora_corte_diario);
