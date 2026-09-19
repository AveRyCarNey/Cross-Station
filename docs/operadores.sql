-- 1. Función para obtener el listado de operadores y sus estadísticas
CREATE OR REPLACE FUNCTION obtener_operadores_dashboard()
RETURNS TABLE (
    id UUID,
    nombre_completo TEXT,
    estado estado_usuario,
    creado_en TIMESTAMP WITH TIME ZONE,
    total_ventas BIGINT,
    total_recaudado DECIMAL
) AS $$
BEGIN
    -- Validar estrictamente que quien llama a la función es un gerente
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
        COALESCE(SUM(v.monto_cobrado), 0.00) AS total_recaudado
    FROM perfiles p
    LEFT JOIN ventas v ON p.id = v.operador_id
    WHERE p.rol = 'operador'
    GROUP BY p.id, p.nombre_completo, p.estado, p.creado_en
    ORDER BY 
        CASE WHEN p.estado = 'pendiente' THEN 1 ELSE 2 END, -- Pendientes primero
        p.creado_en DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función para aprobar, suspender o rechazar accesos
CREATE OR REPLACE FUNCTION cambiar_estado_operador(
    p_operador_id UUID,
    p_nuevo_estado estado_usuario
) RETURNS void AS $$
BEGIN
    -- Validar seguridad
    IF NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol = 'gerente') THEN
        RAISE EXCEPTION 'Acceso denegado.';
    END IF;

    -- Ejecutar el cambio
    UPDATE perfiles SET estado = p_nuevo_estado WHERE id = p_operador_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;