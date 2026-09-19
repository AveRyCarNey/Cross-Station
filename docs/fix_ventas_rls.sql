-- =======================================================
-- SCRIPT DE HABILITACIÓN PARA REGISTRO DE VENTAS EN PISTA
-- Ejecutar en Supabase -> SQL Editor
-- =======================================================

-- 1. Precarga de tanques (si aún no se insertaron)
INSERT INTO tanques (codigo_tanque, producto, capacidad_maxima, volumen_actual) VALUES
('GAS-1A', 'Gasolina', 35000.00, 29750.00),
('GAS-1B', 'Gasolina', 35000.00, 14000.00),
('DIE-2A', 'Diesel', 40000.00, 36000.00),
('DIE-2B', 'Diesel', 40000.00, 6000.00)
ON CONFLICT (codigo_tanque) DO NOTHING;

-- 2. Permitir que operador_id sea opcional si no hay login activo en la terminal
ALTER TABLE ventas ALTER COLUMN operador_id DROP NOT NULL;

-- 3. Políticas de acceso (RLS) para lectura y escritura desde la web
ALTER TABLE tanques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a tanques" ON tanques;
CREATE POLICY "Permitir acceso a tanques" ON tanques FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a ventas" ON ventas;
CREATE POLICY "Permitir acceso a ventas" ON ventas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a perfiles" ON perfiles;
CREATE POLICY "Permitir acceso a perfiles" ON perfiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
