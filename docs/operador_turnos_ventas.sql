-- =====================================================================
-- SCRIPT: HISTORIAL DE VENTAS Y CIERRE DE TURNO PARA OPERADORES
-- Ejecutar en Supabase -> SQL Editor
-- =====================================================================

-- 1. Asegurar columnas de cuadre en cierres_turno si aún no existen
ALTER TABLE cierres_turno 
ADD COLUMN IF NOT EXISTS total_efectivo DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_tarjeta DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_pago_movil DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_vales DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_litros DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_monto DECIMAL(10,2) DEFAULT 0.00;

-- 2. Habilitar y configurar RLS para cierres_turno
ALTER TABLE cierres_turno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso a cierres_turno" ON cierres_turno;
CREATE POLICY "Permitir acceso a cierres_turno" ON cierres_turno 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Función para obtener o iniciar el turno activo de un operador
CREATE OR REPLACE FUNCTION obtener_o_crear_turno_operador(p_operador_id UUID)
RETURNS TABLE (
    id INT,
    operador_id UUID,
    fecha_apertura TIMESTAMP WITH TIME ZONE,
    estado TEXT
) AS $$
DECLARE
    v_turno_id INT;
BEGIN
    -- Buscar si ya tiene un turno abierto
    SELECT c.id INTO v_turno_id
    FROM cierres_turno c
    WHERE c.operador_id = p_operador_id AND c.estado = 'abierto'
    ORDER BY c.fecha_apertura DESC
    LIMIT 1;

    -- Si no existe, crear uno nuevo
    IF v_turno_id IS NULL THEN
        INSERT INTO cierres_turno (operador_id, fecha_apertura, estado)
        VALUES (p_operador_id, timezone('utc'::text, now()), 'abierto')
        RETURNING cierres_turno.id INTO v_turno_id;
    END IF;

    RETURN QUERY
    SELECT c.id, c.operador_id, c.fecha_apertura, c.estado
    FROM cierres_turno c
    WHERE c.id = v_turno_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Función para registrar el Cierre de Turno del operador
CREATE OR REPLACE FUNCTION registrar_cierre_turno(
    p_turno_id INT,
    p_operador_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_efectivo DECIMAL(10,2) := 0.00;
    v_tarjeta DECIMAL(10,2) := 0.00;
    v_pago_movil DECIMAL(10,2) := 0.00;
    v_vales DECIMAL(10,2) := 0.00;
    v_total_litros DECIMAL(10,2) := 0.00;
    v_total_monto DECIMAL(10,2) := 0.00;
BEGIN
    -- Calcular acumulados del turno
    SELECT 
        COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN monto_cobrado ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN monto_cobrado ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN metodo_pago = 'Pago Movil' THEN monto_cobrado ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN metodo_pago = 'Vale Corporativo' THEN monto_cobrado ELSE 0 END), 0.00),
        COALESCE(SUM(litros_vendidos), 0.00),
        COALESCE(SUM(monto_cobrado), 0.00)
    INTO 
        v_efectivo,
        v_tarjeta,
        v_pago_movil,
        v_vales,
        v_total_litros,
        v_total_monto
    FROM ventas
    WHERE turno_id = p_turno_id AND operador_id = p_operador_id;

    -- Cerrar el turno en la tabla
    UPDATE cierres_turno
    SET fecha_cierre = timezone('utc'::text, now()),
        estado = 'cerrado',
        total_efectivo = v_efectivo,
        total_tarjeta = v_tarjeta,
        total_pago_movil = v_pago_movil,
        total_vales = v_vales,
        total_litros = v_total_litros,
        total_monto = v_total_monto
    WHERE id = p_turno_id AND operador_id = p_operador_id;

    RETURN jsonb_build_object(
        'turno_id', p_turno_id,
        'estado', 'cerrado',
        'total_efectivo', v_efectivo,
        'total_tarjeta', v_tarjeta,
        'total_pago_movil', v_pago_movil,
        'total_vales', v_vales,
        'total_litros', v_total_litros,
        'total_monto', v_total_monto
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
