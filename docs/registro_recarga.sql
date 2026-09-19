-- Tabla para auditar la entrada de combustible mediante cisternas
CREATE TABLE recepciones_combustible (
    id SERIAL PRIMARY KEY,
    gerente_id UUID REFERENCES perfiles(id) NOT NULL,
    tanque_id INT REFERENCES tanques(id) NOT NULL,
    volumen_recibido DECIMAL(10,2) NOT NULL,
    nro_guia_despacho TEXT,
    fecha_recepcion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE recepciones_combustible ENABLE ROW LEVEL SECURITY;

-- Solo los perfiles de tipo 'gerente' pueden acceder a este historial
CREATE POLICY "Acceso a recepciones para gerentes" ON recepciones_combustible
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'gerente')
);

-- Función transaccional para sumar el inventario de forma atómica
CREATE OR REPLACE FUNCTION registrar_recepcion_cisterna(
    p_gerente_id UUID,
    p_tanque_id INT,
    p_volumen DECIMAL,
    p_guia TEXT
) RETURNS void AS $$
BEGIN
    -- 1. Registrar la auditoría de la recarga
    INSERT INTO recepciones_combustible (gerente_id, tanque_id, volumen_recibido, nro_guia_despacho)
    VALUES (p_gerente_id, p_tanque_id, p_volumen, p_guia);

    -- 2. Sumar el volumen al tanque físico seleccionado
    UPDATE tanques 
    SET volumen_actual = volumen_actual + p_volumen,
        ultima_actualizacion = NOW()
    WHERE id = p_tanque_id;
END;
$$ LANGUAGE plpgsql;