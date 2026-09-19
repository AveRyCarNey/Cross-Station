-- =====================================================================
-- SCRIPT: DESCUENTO AUTOMÁTICO DE COMBUSTIBLE EN TANQUES POR VENTA
-- Ejecutar en Supabase -> SQL Editor
-- =====================================================================

-- 1. Función trigger que descuenta el volumen del tanque al registrar una venta
CREATE OR REPLACE FUNCTION descontar_combustible_por_venta()
RETURNS TRIGGER AS $$
BEGIN
    -- Descontar los litros vendidos del tanque correspondiente
    UPDATE tanques
    SET volumen_actual = GREATEST(0.00, volumen_actual - NEW.litros_vendidos),
        ultima_actualizacion = timezone('utc'::text, now())
    WHERE id = NEW.tanque_id;

    -- Acumular litros en el surtidor si aplica
    IF NEW.surtidor_id IS NOT NULL THEN
        UPDATE surtidores
        SET litros_acumulados = COALESCE(litros_acumulados, 0) + NEW.litros_vendidos
        WHERE id = NEW.surtidor_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Vincular el trigger a la tabla de ventas
DROP TRIGGER IF EXISTS tr_descontar_combustible_venta ON ventas;
CREATE TRIGGER tr_descontar_combustible_venta
AFTER INSERT ON ventas
FOR EACH ROW
EXECUTE FUNCTION descontar_combustible_por_venta();

-- 3. Eliminar versión previa de la función si tenía otro tipo de retorno
DROP FUNCTION IF EXISTS registrar_venta_combustible CASCADE;
DROP FUNCTION IF EXISTS registrar_venta_combustible(uuid,integer,integer,integer,numeric,numeric,metodo_pago_enum,integer,tipo_venta) CASCADE;

-- 4. Función RPC para registrar la venta y validar stock disponible
CREATE OR REPLACE FUNCTION registrar_venta_combustible(
    p_operador_id UUID,
    p_tanque_id INT,
    p_surtidor_id INT,
    p_turno_id INT,
    p_litros DECIMAL,
    p_monto DECIMAL,
    p_metodo_pago metodo_pago_enum,
    p_vehiculo_id INT DEFAULT NULL,
    p_tipo tipo_venta DEFAULT 'unica'
) RETURNS JSONB AS $$
DECLARE
    v_venta_id INT;
    v_stock_actual DECIMAL(10,2);
BEGIN
    -- Validar que el tanque exista y obtener stock
    SELECT volumen_actual INTO v_stock_actual
    FROM tanques
    WHERE id = p_tanque_id
    FOR UPDATE;

    IF v_stock_actual IS NULL THEN
        RAISE EXCEPTION 'El tanque seleccionado (%) no existe.', p_tanque_id;
    END IF;

    IF v_stock_actual < p_litros THEN
        RAISE EXCEPTION 'Combustible insuficiente en el tanque %. Stock actual: % L, Despacho solicitado: % L.', 
            p_tanque_id, v_stock_actual, p_litros;
    END IF;

    -- Insertar venta (el trigger tr_descontar_combustible_venta restará automáticamente el volumen)
    INSERT INTO ventas (
        operador_id,
        tanque_id,
        surtidor_id,
        turno_id,
        litros_vendidos,
        monto_cobrado,
        metodo_pago,
        vehiculo_id,
        tipo,
        fecha_registro
    ) VALUES (
        p_operador_id,
        p_tanque_id,
        p_surtidor_id,
        p_turno_id,
        p_litros,
        p_monto,
        p_metodo_pago,
        p_vehiculo_id,
        p_tipo,
        timezone('utc'::text, now())
    ) RETURNING id INTO v_venta_id;

    -- Si es flota corporativa con vehículo, sumar al saldo consumido
    IF p_vehiculo_id IS NOT NULL THEN
        UPDATE clientes_corporativos cc
        SET saldo_consumido = COALESCE(saldo_consumido, 0) + p_monto
        FROM vehiculos_autorizados va
        WHERE va.id = p_vehiculo_id AND va.cliente_id = cc.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'venta_id', v_venta_id,
        'tanque_id', p_tanque_id,
        'litros_despachados', p_litros,
        'volumen_restante', (v_stock_actual - p_litros)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
