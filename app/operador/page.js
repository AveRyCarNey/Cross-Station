'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PanelOperador() {
  const [tabActiva, setTabActiva] = useState('despacho'); // 'despacho' | 'tanques' | 'ventas' | 'cierre'
  const [tanques, setTanques] = useState([]);
  const [surtidores, setSurtidores] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [misVentas, setMisVentas] = useState([]);
  const [turnoActivo, setTurnoActivo] = useState(null);
  const [resumenTurnoCerrado, setResumenTurnoCerrado] = useState(null);
  const [modalPreguntarTurno, setModalPreguntarTurno] = useState(false);
  const haPreguntadoTurnoRef = React.useRef(false);
  
  // Formulario de venta
  const [combustible, setCombustible] = useState('Gasolina'); // 'Gasolina' | 'Diesel'
  const [litros, setLitros] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [placa, setPlaca] = useState('');
  const [precios, setPrecios] = useState({ Gasolina: 0.50, Diesel: 0.45 });
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState(null);
  const [mensajeCierre, setMensajeCierre] = useState(null);

  // Carga inicial y datos del operador
  const cargarDatos = async () => {
    setLoadingData(true);
    try {
      const [{ data: tanquesData, error: tErr }, { data: surtidoresData, error: sErr }, { data: userData }, { data: preciosData }] = await Promise.all([
        supabase.from('tanques').select('*').order('id', { ascending: true }),
        supabase.from('surtidores').select('*, tanques(*)').order('id', { ascending: true }),
        supabase.auth.getUser(),
        supabase.from('precios_combustible').select('*')
      ]);

      if (tErr) console.warn('Aviso tanques:', tErr.message);
      if (sErr) console.warn('Aviso surtidores:', sErr.message);

      setTanques(tanquesData || []);
      setSurtidores(surtidoresData || []);

      if (preciosData && preciosData.length > 0) {
        const mapa = { Gasolina: 0.50, Diesel: 0.45 };
        preciosData.forEach((p) => {
          if (p.producto && !isNaN(p.precio_litro)) {
            mapa[p.producto] = Number(p.precio_litro);
          }
        });
        setPrecios(mapa);
      }

      const userId = userData?.user?.id;
      if (userId) {
        // Cargar perfil del operador
        const { data: perfilData } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (perfilData) setPerfil(perfilData);

        // Cargar turno abierto del operador
        const { data: turnoData } = await supabase
          .from('cierres_turno')
          .select('*')
          .eq('operador_id', userId)
          .eq('estado', 'abierto')
          .order('fecha_apertura', { ascending: false })
          .limit(1)
          .maybeSingle();

        const turnoEncontrado = turnoData || null;
        setTurnoActivo(turnoEncontrado);

        // Al iniciar sesión: preguntar si desea iniciar su turno
        if (!turnoEncontrado && !haPreguntadoTurnoRef.current) {
          haPreguntadoTurnoRef.current = true;
          setModalPreguntarTurno(true);
        }

        // Cargar ventas propias del operador
        const { data: ventasData } = await supabase
          .from('ventas')
          .select(`
            id,
            litros_vendidos,
            monto_cobrado,
            metodo_pago,
            fecha_registro,
            turno_id,
            tanques(codigo_tanque, producto)
          `)
          .eq('operador_id', userId)
          .order('fecha_registro', { ascending: false });

        setMisVentas(ventasData || []);
      }
    } catch (err) {
      console.error('Error al inicializar datos:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Tanques asignados al operador
  const tanquesGasolina = tanques.filter((t) => t.producto === 'Gasolina');
  const tanquesDiesel = tanques.filter((t) => t.producto === 'Diesel');

  const tanqueGasolina = perfil?.tanque_gasolina_id
    ? tanques.find((t) => t.id === perfil.tanque_gasolina_id) || tanquesGasolina[0]
    : tanquesGasolina[0];

  const tanqueDiesel = perfil?.tanque_diesel_id
    ? tanques.find((t) => t.id === perfil.tanque_diesel_id) || tanquesDiesel[0]
    : tanquesDiesel[0];

  const tanqueActivo = combustible === 'Gasolina' ? tanqueGasolina : tanqueDiesel;

  // Precio actual según combustible elegido
  const precioPorLitroActual = precios[combustible] || (combustible === 'Gasolina' ? 0.50 : 0.45);

  // Cálculo automático del monto sugerido
  const handleLitrosChange = (e) => {
    const val = e.target.value;
    setLitros(val);
    if (val && !isNaN(val) && parseFloat(val) > 0) {
      setMonto((parseFloat(val) * precioPorLitroActual).toFixed(2));
    } else {
      setMonto('');
    }
  };

  const handleCambiarCombustible = (nuevoCombustible) => {
    setCombustible(nuevoCombustible);
    const nuevoPrecio = precios[nuevoCombustible] || (nuevoCombustible === 'Gasolina' ? 0.50 : 0.45);
    if (litros && !isNaN(litros) && parseFloat(litros) > 0) {
      setMonto((parseFloat(litros) * nuevoPrecio).toFixed(2));
    }
  };

  // 1. Guardar Venta
  const handleConfirmarVenta = async (e) => {
    e.preventDefault();
    setMessage(null);

    const cantidadLitros = parseFloat(litros);
    const montoCobrado = parseFloat(monto);

    // 1. Bloqueo obligatorio: sin turno activo no se puede vender
    if (!turnoActivo) {
      setMessage({
        type: 'error',
        text: 'Debes iniciar tu turno antes de registrar ventas de combustible.'
      });
      setModalPreguntarTurno(true);
      return;
    }

    if (isNaN(cantidadLitros) || cantidadLitros <= 0) {
      setMessage({ type: 'error', text: 'Escribe cuántos litros despachaste.' });
      return;
    }

    if (isNaN(montoCobrado) || montoCobrado <= 0) {
      setMessage({ type: 'error', text: 'Escribe cuánto dinero se cobró.' });
      return;
    }

    // 2. Validar stock suficiente en el tanque activo
    if (tanqueActivo && cantidadLitros > Number(tanqueActivo.volumen_actual || 0)) {
      setMessage({
        type: 'error',
        text: `No hay suficiente combustible en el tanque ${tanqueActivo.codigo_tanque}. Stock disponible: ${Number(tanqueActivo.volumen_actual || 0).toFixed(2)} L.`
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const p_operador_id = userData?.user?.id;

      if (!p_operador_id) {
        throw new Error('Debes iniciar sesión para registrar una venta.');
      }

      const p_turno_id = turnoActivo.id;

      const p_tanque_id = tanqueActivo ? tanqueActivo.id : (tanques[0]?.id || 1);
      const surtidorAsociado = surtidores.find((s) => s.tanque_id === p_tanque_id);
      const p_surtidor_id = surtidorAsociado ? surtidorAsociado.id : 1;

      let p_vehiculo_id = null;
      if (placa && placa.trim()) {
        try {
          const { data: vehiculo } = await supabase
            .from('vehiculos_autorizados')
            .select('id')
            .ilike('placa', placa.trim())
            .maybeSingle();
          if (vehiculo) p_vehiculo_id = vehiculo.id;
        } catch (vErr) {
          console.warn('Consulta vehículo:', vErr);
        }
      }

      // 1. Intentar registrar vía RPC transaccional
      const { error: rpcError } = await supabase.rpc('registrar_venta_combustible', {
        p_operador_id,
        p_tanque_id,
        p_surtidor_id,
        p_turno_id,
        p_litros: cantidadLitros,
        p_monto: montoCobrado,
        p_metodo_pago: metodoPago,
        p_vehiculo_id,
        p_tipo: 'unica'
      });

      if (rpcError) {
        console.warn('Fallo RPC registrar_venta_combustible, aplicando guardado directo:', rpcError.message);

        // 2. Inserción directa en tabla ventas
        const { error: insertError } = await supabase
          .from('ventas')
          .insert([{
            operador_id: p_operador_id,
            tanque_id: p_tanque_id,
            surtidor_id: p_surtidor_id,
            turno_id: p_turno_id,
            litros_vendidos: cantidadLitros,
            monto_cobrado: montoCobrado,
            metodo_pago: metodoPago,
            vehiculo_id: p_vehiculo_id,
            tipo: 'unica'
          }]);

        if (insertError) throw insertError;

        // 3. Descontar inventario físico del tanque directamente
        if (tanqueActivo) {
          const nuevoVolumen = Math.max(0, Number(tanqueActivo.volumen_actual || 0) - cantidadLitros);
          await supabase
            .from('tanques')
            .update({
              volumen_actual: nuevoVolumen,
              ultima_actualizacion: new Date().toISOString()
            })
            .eq('id', p_tanque_id);
        }
      }

      // Webhook en segundo plano
      fetch('http://localhost:5678/webhook/mantenimiento-surtidor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surtidor_id: p_surtidor_id,
          litros_despachados: cantidadLitros
        })
      }).catch((webhookErr) => {
        console.warn('Webhook n8n:', webhookErr.message);
      });

      setLitros('');
      setMonto('');
      setPlaca('');
      setMessage({
        type: 'success',
        text: `¡Listo! Venta de ${cantidadLitros} L (${combustible}) guardada con éxito. Stock descontado del tanque.`
      });

      await cargarDatos();
    } catch (err) {
      console.error('Error al registrar venta:', err);
      setMessage({
        type: 'error',
        text: err.message || 'No se pudo guardar la venta. Intenta de nuevo.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Iniciar Nuevo Turno
  const handleIniciarTurno = async () => {
    setIsLoading(true);
    setMensajeCierre(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Sesión requerida.');

      const { data: nuevoTurno, error } = await supabase
        .from('cierres_turno')
        .insert([{ operador_id: userId, estado: 'abierto' }])
        .select()
        .single();

      if (error) throw error;

      setTurnoActivo(nuevoTurno);
      setResumenTurnoCerrado(null);
      setModalPreguntarTurno(false);
      setMensajeCierre({ tipo: 'exito', texto: `Turno iniciado con éxito a las ${new Date().toLocaleTimeString('es-ES')}.` });
      setMessage({ type: 'success', text: '¡Turno iniciado! Ya puedes registrar ventas.' });
      await cargarDatos();
    } catch (err) {
      console.error('Error al iniciar turno:', err);
      setMensajeCierre({ tipo: 'error', texto: err.message || 'No se pudo iniciar el turno.' });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Registrar Cierre de Turno
  const handleCerrarTurno = async () => {
    if (!turnoActivo) return;
    setIsLoading(true);
    setMensajeCierre(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Sesión requerida.');

      // 1. Intentar registrar cierre mediante la función RPC
      const { data: rpcCierre, error: rpcErr } = await supabase.rpc('registrar_cierre_turno', {
        p_turno_id: turnoActivo.id,
        p_operador_id: userId
      });

      let resumen = rpcCierre;

      if (rpcErr) {
        // 2. Fallback con cálculo manual directo
        const ventasDelTurno = misVentas.filter((v) => v.turno_id === turnoActivo.id);
        const efectivo = ventasDelTurno.filter((v) => v.metodo_pago === 'Efectivo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
        const tarjeta = ventasDelTurno.filter((v) => v.metodo_pago === 'Tarjeta').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
        const pagoMovil = ventasDelTurno.filter((v) => v.metodo_pago === 'Pago Movil').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
        const vales = ventasDelTurno.filter((v) => v.metodo_pago === 'Vale Corporativo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
        const litrosTotal = ventasDelTurno.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
        const montoTotal = efectivo + tarjeta + pagoMovil + vales;

        const { error: updErr } = await supabase
          .from('cierres_turno')
          .update({
            fecha_cierre: new Date().toISOString(),
            estado: 'cerrado',
            total_efectivo: efectivo,
            total_tarjeta: tarjeta,
            total_pago_movil: pagoMovil,
            total_vales: vales,
            total_litros: litrosTotal,
            total_monto: montoTotal
          })
          .eq('id', turnoActivo.id);

        if (updErr) throw updErr;

        resumen = {
          turno_id: turnoActivo.id,
          total_efectivo: efectivo,
          total_tarjeta: tarjeta,
          total_pago_movil: pagoMovil,
          total_vales: vales,
          total_litros: litrosTotal,
          total_monto: montoTotal
        };
      }

      setResumenTurnoCerrado(resumen);
      setTurnoActivo(null);
      setMensajeCierre({
        tipo: 'exito',
        texto: '¡Turno cerrado correctamente! Tu responsabilidad operativa del turno ha quedado registrada.'
      });

      await cargarDatos();
    } catch (err) {
      console.error('Error al cerrar turno:', err);
      setMensajeCierre({ tipo: 'error', texto: err.message || 'Error al procesar el cierre de turno.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCerrarSesion = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error cerrando sesión:', err);
    } finally {
      window.location.href = '/';
    }
  };

  // Totales acumulados de hoy para el operador
  const ventasHoy = misVentas.filter((v) => {
    const fechaVenta = new Date(v.fecha_registro).toDateString();
    const hoy = new Date().toDateString();
    return fechaVenta === hoy;
  });

  const totalLitrosHoy = ventasHoy.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
  const totalMontoHoy = ventasHoy.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);

  // Ventas del turno actual para el cuadre
  const ventasTurnoActual = turnoActivo ? misVentas.filter((v) => v.turno_id === turnoActivo.id) : [];
  const efectivoTurno = ventasTurnoActual.filter((v) => v.metodo_pago === 'Efectivo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const tarjetaTurno = ventasTurnoActual.filter((v) => v.metodo_pago === 'Tarjeta').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const pagoMovilTurno = ventasTurnoActual.filter((v) => v.metodo_pago === 'Pago Movil').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const valesTurno = ventasTurnoActual.filter((v) => v.metodo_pago === 'Vale Corporativo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const litrosTurno = ventasTurnoActual.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
  const totalDineroTurno = efectivoTurno + tarjetaTurno + pagoMovilTurno + valesTurno;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Barra Superior del Operador */}
      <header className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center px-6">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold">
            Cross-<span className="text-blue-400">Station</span>
          </div>
          <span
            style={{
              backgroundColor: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #475569',
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '12px'
            }}
          >
            Operador: <strong style={{ color: '#60a5fa' }}>{perfil?.nombre_completo || 'Cargando...'}</strong>
          </span>
          <span
            style={
              turnoActivo
                ? {
                    backgroundColor: '#064e3b',
                    color: '#6ee7b7',
                    border: '1px solid #059669',
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }
                : {
                    backgroundColor: '#451a03',
                    color: '#fcd34d',
                    border: '1px solid #d97706',
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }
            }
          >
            {turnoActivo ? `Turno Abierto (#${turnoActivo.id})` : 'Turno No Iniciado'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={loadingData}
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontWeight: '700',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '13px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              cursor: loadingData ? 'not-allowed' : 'pointer',
              opacity: loadingData ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            className="hover:bg-slate-100 transition-colors"
          >
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loadingData ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
          <button
            type="button"
            onClick={handleCerrarSesion}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontWeight: '700',
              border: '1px solid #b91c1c',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '13px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            className="hover:bg-red-700 transition-colors"
          >
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* Pestañas de Navegación del Operador */}
      <nav className="bg-white border-b border-slate-200 px-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTabActiva('despacho')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            tabActiva === 'despacho'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cobrar Despacho
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('tanques')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            tabActiva === 'tanques'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mis Tanques Asignados
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('ventas')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            tabActiva === 'ventas'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mis Ventas ({misVentas.length})
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('cierre')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            tabActiva === 'cierre'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cierre de Turno
        </button>
      </nav>

      {/* Contenido Principal según pestaña */}
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        {/* PESTAÑA 1: COBRAR DESPACHO */}
        {tabActiva === 'despacho' && (
          <div className="flex justify-center">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-slate-200">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Cobrar Gasolina / Despacho</h2>

              {/* Bloqueo si no hay turno iniciado */}
              {!turnoActivo && (
                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '20px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
                    <svg style={{ width: '20px', height: '20px', color: '#b45309' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <strong style={{ color: '#92400e', fontSize: '15px' }}>Turno No Iniciado</strong>
                  </div>
                  <p style={{ color: '#78350f', fontSize: '13px', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    No puedes registrar ventas ni despachos hasta que inicies tu turno operativo.
                  </p>
                  <button
                    type="button"
                    onClick={handleIniciarTurno}
                    disabled={isLoading}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: '700',
                      padding: '8px 18px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    className="hover:bg-blue-700 transition-colors"
                  >
                    <span>{isLoading ? 'Iniciando Turno...' : 'Iniciar Turno Ahora'}</span>
                  </button>
                </div>
              )}

              {message && (
                <div
                  className={`p-4 mb-5 rounded-lg text-sm border ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-800 border-green-200'
                      : 'bg-red-100 text-red-700 border-red-200'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <form onSubmit={handleConfirmarVenta} className="space-y-4">
                {/* Selector directo de Gasolina o Diesel */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      Tipo de Combustible
                    </label>
                    {tanqueActivo && (
                      <span className="text-xs text-slate-500 font-medium">
                        Tanque: <strong className="text-blue-700 font-semibold">{tanqueActivo.codigo_tanque}</strong>
                        <span className="ml-1 font-semibold text-slate-700">({Number(tanqueActivo.volumen_actual || 0).toLocaleString('es-ES')} L disp.)</span>
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => handleCambiarCombustible('Gasolina')}
                      disabled={!turnoActivo || isLoading}
                      className={`py-3 px-4 rounded-xl border-2 font-bold text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        combustible === 'Gasolina'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      } ${!turnoActivo ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="text-sm">Gasolina</span>
                      <span className="text-xs font-semibold mt-0.5 opacity-80">
                        ${Number(precios.Gasolina || 0.50).toFixed(2)} / Litro
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCambiarCombustible('Diesel')}
                      disabled={!turnoActivo || isLoading}
                      className={`py-3 px-4 rounded-xl border-2 font-bold text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        combustible === 'Diesel'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      } ${!turnoActivo ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="text-sm">Diesel</span>
                      <span className="text-xs font-semibold mt-0.5 opacity-80">
                        ${Number(precios.Diesel || 0.45).toFixed(2)} / Litro
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">¿Cuántos litros?</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      required
                      disabled={!turnoActivo || isLoading}
                      value={litros}
                      onChange={handleLitrosChange}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      placeholder="Ej: 40.00"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-600">Total a cobrar ($)</label>
                      <span className="text-xs text-blue-700 font-bold">${precioPorLitroActual.toFixed(2)}/L</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      disabled={!turnoActivo || isLoading}
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      placeholder="Ej: 20.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">¿Cómo paga el cliente?</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    disabled={!turnoActivo || isLoading}
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta (Punto de venta)</option>
                    <option value="Pago Movil">Pago Móvil</option>
                    <option value="Vale Corporativo">Vale de empresa (Flota)</option>
                  </select>
                </div>

                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${
                      metodoPago === 'Vale Corporativo' ? 'text-slate-700 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    Placa del carro {metodoPago === 'Vale Corporativo' ? '(Obligatorio para vales)' : '(Opcional)'}
                  </label>
                  <input
                    type="text"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value)}
                    disabled={!turnoActivo || isLoading}
                    required={metodoPago === 'Vale Corporativo'}
                    className={`w-full border rounded-lg p-2.5 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed ${
                      metodoPago === 'Vale Corporativo'
                        ? 'border-blue-400 bg-white focus:ring-2 focus:ring-blue-500'
                        : 'border-slate-300 bg-white'
                    }`}
                    placeholder="Ej: AB123CD"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!turnoActivo || isLoading || loadingData}
                  style={
                    !turnoActivo
                      ? { backgroundColor: '#94a3b8', color: '#ffffff', cursor: 'not-allowed' }
                      : { backgroundColor: '#2563eb', color: '#ffffff', cursor: 'pointer' }
                  }
                  className="w-full font-bold py-3 rounded-lg shadow-md transition-colors mt-4 text-sm"
                >
                  {!turnoActivo ? 'Debes iniciar turno para registrar ventas' : isLoading ? 'Guardando...' : 'Guardar Venta'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: DASHBOARD DE MIS TANQUES */}
        {tabActiva === 'tanques' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800">Tanques Designados</h2>
              <p className="text-xs text-slate-500 mt-1">
                Consulta el nivel actual de los tanques con los que trabajas asignados por el encargado
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Tarjeta Tanque Gasolina */}
                {tanqueGasolina ? (
                  <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-slate-800 text-lg">{tanqueGasolina.codigo_tanque}</span>
                      <span className="text-xs px-2.5 py-1 rounded font-bold bg-green-100 text-green-800 border border-green-200">
                        Gasolina
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Stock: <strong>{Number(tanqueGasolina.volumen_actual).toLocaleString('es-ES')}</strong> de {Number(tanqueGasolina.capacidad_maxima).toLocaleString('es-ES')} L
                    </p>
                    {(() => {
                      const porc = Math.min(100, Math.max(0, Math.round((Number(tanqueGasolina.volumen_actual) / Number(tanqueGasolina.capacidad_maxima || 1)) * 100)));
                      return (
                        <>
                          <div className="w-full bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                            <div
                              className="bg-green-500 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${porc}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-slate-600 font-medium">
                            <span>{porc}% de capacidad</span>
                            <span className={porc < 30 ? 'text-red-600 font-bold' : 'text-emerald-700'}>
                              {porc < 30 ? 'Nivel Bajo' : 'Nivel Seguro'}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 text-sm">
                    No tienes tanque de Gasolina asignado.
                  </div>
                )}

                {/* Tarjeta Tanque Diesel */}
                {tanqueDiesel ? (
                  <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-slate-800 text-lg">{tanqueDiesel.codigo_tanque}</span>
                      <span className="text-xs px-2.5 py-1 rounded font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        Diesel
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Stock: <strong>{Number(tanqueDiesel.volumen_actual).toLocaleString('es-ES')}</strong> de {Number(tanqueDiesel.capacidad_maxima).toLocaleString('es-ES')} L
                    </p>
                    {(() => {
                      const porc = Math.min(100, Math.max(0, Math.round((Number(tanqueDiesel.volumen_actual) / Number(tanqueDiesel.capacidad_maxima || 1)) * 100)));
                      return (
                        <>
                          <div className="w-full bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${porc}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-slate-600 font-medium">
                            <span>{porc}% de capacidad</span>
                            <span className={porc < 30 ? 'text-red-600 font-bold' : 'text-blue-700'}>
                              {porc < 30 ? 'Nivel Bajo' : 'Nivel Seguro'}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 text-sm">
                    No tienes tanque de Diesel asignado.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: MIS VENTAS (HISTORIAL) */}
        {tabActiva === 'ventas' && (
          <div className="space-y-6">
            {/* Tarjetas de Resumen de Hoy */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 uppercase font-bold">Total Cobrado Hoy</span>
                <p className="text-2xl font-black text-green-600 mt-1">${totalMontoHoy.toFixed(2)}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 uppercase font-bold">Litros Despachados Hoy</span>
                <p className="text-2xl font-black text-blue-600 mt-1">{totalLitrosHoy.toFixed(2)} L</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 uppercase font-bold">Despachos de Hoy</span>
                <p className="text-2xl font-black text-slate-700 mt-1">{ventasHoy.length}</p>
              </div>
            </div>

            {/* Tabla de Historial de Ventas */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Historial de mis Despachos</h3>
                <span className="text-xs text-slate-500">Últimas transacciones registradas por ti</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs">
                    <tr>
                      <th className="p-3">Hora</th>
                      <th className="p-3">Tanque / Producto</th>
                      <th className="p-3 text-right">Litros</th>
                      <th className="p-3 text-right">Cobrado ($)</th>
                      <th className="p-3">Forma de Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misVentas.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-500">
                          Aún no has registrado ventas en el sistema.
                        </td>
                      </tr>
                    ) : (
                      misVentas.map((v) => (
                        <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 font-mono text-xs text-slate-600">
                            {new Date(v.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-3 font-medium text-slate-800">
                            {v.tanques?.codigo_tanque || 'Tanque'} ({v.tanques?.producto || 'Combustible'})
                          </td>
                          <td className="p-3 text-right font-bold text-blue-600">
                            {Number(v.litros_vendidos || 0).toFixed(2)} L
                          </td>
                          <td className="p-3 text-right font-bold text-green-600">
                            ${Number(v.monto_cobrado || 0).toFixed(2)}
                          </td>
                          <td className="p-3">
                            <span className="text-xs bg-slate-100 px-2 py-1 rounded font-semibold text-slate-700 border border-slate-200">
                              {v.metodo_pago || 'Efectivo'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 4: CIERRE DE TURNO */}
        {tabActiva === 'cierre' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-xl font-bold text-slate-800">Cierre de Turno y Cuadre de Caja</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Registra el cierre de tu turno para delimitar tu responsabilidad operativa sobre el dinero y combustible despachado
                </p>
              </div>

              {mensajeCierre && (
                <div
                  className={`p-4 mb-5 rounded-lg text-sm border ${
                    mensajeCierre.tipo === 'exito'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {mensajeCierre.texto}
                </div>
              )}

              {turnoActivo ? (
                <div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Turno Activo Actual</span>
                      <p className="text-sm text-blue-950 mt-0.5">
                        Iniciado: <strong>{new Date(turnoActivo.fecha_apertura).toLocaleString('es-ES')}</strong>
                      </p>
                    </div>
                    <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      En Curso
                    </span>
                  </div>

                  {/* Cuadre de caja del turno */}
                  <h3 className="font-bold text-slate-800 text-sm mb-3">Resumen de ventas del turno actual:</h3>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 text-sm mb-6 bg-slate-50">
                    <div className="p-3.5 flex justify-between items-center">
                      <span className="text-slate-600">Efectivo recibido en caja:</span>
                      <strong className="text-slate-800">${efectivoTurno.toFixed(2)}</strong>
                    </div>
                    <div className="p-3.5 flex justify-between items-center">
                      <span className="text-slate-600">Tarjeta / POS:</span>
                      <strong className="text-slate-800">${tarjetaTurno.toFixed(2)}</strong>
                    </div>
                    <div className="p-3.5 flex justify-between items-center">
                      <span className="text-slate-600">Pago Móvil:</span>
                      <strong className="text-slate-800">${pagoMovilTurno.toFixed(2)}</strong>
                    </div>
                    <div className="p-3.5 flex justify-between items-center">
                      <span className="text-slate-600">Vales Corporativos (Flota):</span>
                      <strong className="text-slate-800">${valesTurno.toFixed(2)}</strong>
                    </div>
                    <div className="p-3.5 flex justify-between items-center bg-slate-100 font-bold text-base">
                      <span className="text-slate-800">Total Dinero del Turno:</span>
                      <span className="text-green-700">${totalDineroTurno.toFixed(2)}</span>
                    </div>
                    <div className="p-3.5 flex justify-between items-center bg-blue-50 text-blue-900 font-bold">
                      <span>Total Litros Despachados:</span>
                      <span>{litrosTurno.toFixed(2)} L ({ventasTurnoActual.length} despachos)</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCerrarTurno}
                    disabled={isLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer shadow disabled:opacity-50"
                  >
                    {isLoading ? 'Cerrando Turno...' : 'Cerrar mi Turno y Entregar Caja'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl mb-6">
                    <h3 className="font-bold text-slate-800 text-base mb-1">No tienes un turno abierto en este momento</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Para delimitar tus ventas y cobros en pista, inicia tu turno operativo.
                    </p>
                    <button
                      type="button"
                      onClick={handleIniciarTurno}
                      disabled={isLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors cursor-pointer shadow disabled:opacity-50 text-sm"
                    >
                      {isLoading ? 'Iniciando...' : 'Iniciar Turno Ahora'}
                    </button>
                  </div>

                  {resumenTurnoCerrado && (
                    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-5 text-left text-sm">
                      <h4 className="font-bold text-emerald-900 mb-2">Comprobante de Último Turno Cerrado</h4>
                      <p className="text-xs text-emerald-800 mb-3">
                        Turno #{resumenTurnoCerrado.turno_id} delimitado y cerrado exitosamente.
                      </p>
                      <div className="space-y-1 text-xs text-emerald-900 font-medium">
                        <div>Efectivo: <strong>${Number(resumenTurnoCerrado.total_efectivo || 0).toFixed(2)}</strong></div>
                        <div>Tarjeta: <strong>${Number(resumenTurnoCerrado.total_tarjeta || 0).toFixed(2)}</strong></div>
                        <div>Pago Móvil: <strong>${Number(resumenTurnoCerrado.total_pago_movil || 0).toFixed(2)}</strong></div>
                        <div>Vales: <strong>${Number(resumenTurnoCerrado.total_vales || 0).toFixed(2)}</strong></div>
                        <div className="pt-2 border-t border-emerald-200 font-bold text-sm">
                          Total Turno: ${Number(resumenTurnoCerrado.total_monto || 0).toFixed(2)} ({Number(resumenTurnoCerrado.total_litros || 0).toFixed(2)} L)
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal Preguntar Iniciar Turno al Iniciar Sesión */}
      {modalPreguntarTurno && !turnoActivo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '9999px',
                  backgroundColor: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1d4ed8',
                  flexShrink: 0
                }}
              >
                <svg style={{ width: '22px', height: '22px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                  ¿Quieres iniciar tu turno ahora?
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Bienvenido, {perfil?.nombre_completo || 'Operador'}
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Para poder cobrar despachos y registrar ventas de combustible, necesitas abrir tu turno. Esto delimita tu responsabilidad sobre el dinero recibido y los litros despachados.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={async () => {
                  setModalPreguntarTurno(false);
                  await handleIniciarTurno();
                }}
                disabled={isLoading}
                style={{
                  flex: 1,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: '700',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)'
                }}
                className="hover:bg-blue-700 transition-colors"
              >
                {isLoading ? 'Iniciando Turno...' : 'Iniciar Turno Ahora'}
              </button>
              <button
                type="button"
                onClick={() => setModalPreguntarTurno(false)}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#64748b',
                  fontWeight: '600',
                  border: '1px solid #cbd5e1',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
                className="hover:bg-slate-100 transition-colors"
              >
                Más tarde
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
