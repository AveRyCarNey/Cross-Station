-- =====================================================================
-- SCRIPT: ASIGNACIÓN DE TANQUES POR OPERADOR (GASOLINA Y DIESEL)
-- Ejecutar en Supabase -> SQL Editor
-- =====================================================================

-- 1. Agregar columnas a la tabla perfiles para los tanques asignados
ALTER TABLE perfiles 
ADD COLUMN IF NOT EXISTS tanque_gasolina_id INT REFERENCES tanques(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tanque_diesel_id INT REFERENCES tanques(id) ON DELETE SET NULL;

-- 2. Precarga: Asignar tanques iniciales a los operadores existentes
DO $$
DECLARE
    v_gas_id INT;
    v_die_id INT;
BEGIN
    SELECT id INTO v_gas_id FROM tanques WHERE producto = 'Gasolina' ORDER BY id LIMIT 1;
    SELECT id INTO v_die_id FROM tanques WHERE producto = 'Diesel' ORDER BY id LIMIT 1;

    IF v_gas_id IS NOT NULL THEN
        UPDATE perfiles SET tanque_gasolina_id = v_gas_id WHERE tanque_gasolina_id IS NULL AND rol = 'operador';
    END IF;

    IF v_die_id IS NOT NULL THEN
        UPDATE perfiles SET tanque_diesel_id = v_die_id WHERE tanque_diesel_id IS NULL AND rol = 'operador';
    END IF;
END $$;

-- 3. Actualizar función para obtener operadores del dashboard con sus tanques asignados
DROP FUNCTION IF EXISTS obtener_operadores_dashboard();

CREATE OR REPLACE FUNCTION obtener_operadores_dashboard()
RETURNS TABLE (
    id UUID,
    nombre_completo TEXT,
    estado estado_usuario,
    creado_en TIMESTAMP WITH TIME ZONE,
    total_ventas BIGINT,
    total_recaudado DECIMAL,
    tanque_gasolina_id INT,
    tanque_diesel_id INT
) AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol = 'gerente') THEN
        RAISE EXCEPTION 'Acceso denegado. Solo gerentes pueden auditar operadores.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.nombre_completo,
        p.estado,
        p.creado_en,
        COUNT(v.id)::BIGINT AS total_ventas,
        COALESCE(SUM(v.monto_cobrado), 0.00) AS total_recaudado,
        p.tanque_gasolina_id,
        p.tanque_diesel_id
    FROM perfiles p
    LEFT JOIN ventas v ON p.id = v.operador_id
    WHERE p.rol = 'operador'
    GROUP BY p.id, p.nombre_completo, p.estado, p.creado_en, p.tanque_gasolina_id, p.tanque_diesel_id
    ORDER BY 
        CASE WHEN p.estado = 'pendiente' THEN 1 ELSE 2 END,
        p.creado_en DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Función para que el gerente asigne tanques a un operador
CREATE OR REPLACE FUNCTION asignar_tanques_operador(
    p_operador_id UUID,
    p_tanque_gasolina_id INT,
    p_tanque_diesel_id INT
) RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol = 'gerente') THEN
        RAISE EXCEPTION 'Acceso denegado. Solo gerentes pueden asignar tanques.';
    END IF;

    UPDATE perfiles
    SET tanque_gasolina_id = p_tanque_gasolina_id,
        tanque_diesel_id = p_tanque_diesel_id
    WHERE id = p_operador_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
