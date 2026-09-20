-- =====================================================================
-- SCRIPT DE DESBLOQUEO RLS PARA REPORTES, CRON JOBS Y API EN VERCEL
-- Ejecutar en Supabase -> SQL Editor -> RUN
-- =====================================================================

-- 1. TANQUES (Permitir lectura y actualización a la API)
ALTER TABLE tanques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a tanques" ON tanques;
DROP POLICY IF EXISTS "Permitir lectura general tanques" ON tanques;
CREATE POLICY "Permitir acceso a tanques" ON tanques 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 2. VENTAS (Permitir consulta completa para consolidar ingresos y litros)
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a ventas" ON ventas;
DROP POLICY IF EXISTS "Permitir lectura general ventas" ON ventas;
CREATE POLICY "Permitir acceso a ventas" ON ventas 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 3. RECEPCIONES DE COMBUSTIBLE (Permitir lectura de recargas de cisterna)
ALTER TABLE recepciones_combustible ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso a recepciones para gerentes" ON recepciones_combustible;
DROP POLICY IF EXISTS "Permitir acceso a recepciones" ON recepciones_combustible;
CREATE POLICY "Permitir acceso a recepciones" ON recepciones_combustible 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 4. CONFIGURACIÓN DE REPORTES (Garantizar acceso al cron)
ALTER TABLE configuracion_reportes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total a configuracion_reportes" ON configuracion_reportes;
CREATE POLICY "Permitir acceso total a configuracion_reportes" ON configuracion_reportes 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 5. PERFILES
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a perfiles" ON perfiles;
CREATE POLICY "Permitir acceso a perfiles" ON perfiles 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);
