-- =====================================================================
-- SCRIPT: TABLA DE PRECIOS DE COMBUSTIBLE (GASOLINA Y DIESEL)
-- Ejecutar en Supabase -> SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS precios_combustible (
    producto TEXT PRIMARY KEY,
    precio_litro DECIMAL(10,2) NOT NULL DEFAULT 0.50,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE precios_combustible ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a precios_combustible" ON precios_combustible;
CREATE POLICY "Permitir acceso a precios_combustible" ON precios_combustible 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Insertar precios base si no existen
INSERT INTO precios_combustible (producto, precio_litro) VALUES
('Gasolina', 0.50),
('Diesel', 0.45)
ON CONFLICT (producto) DO NOTHING;
