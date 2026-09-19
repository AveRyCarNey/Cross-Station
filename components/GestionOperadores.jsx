'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function GestionOperadores({ tanquesActuales = [] }) {
  const [operadores, setOperadores] = useState([]);
  const [tanques, setTanques] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);
  const [guardandoTanqueId, setGuardandoTanqueId] = useState(null);

  // Cargar tanques si no vienen provistos por el padre
  useEffect(() => {
    if (tanquesActuales && tanquesActuales.length > 0) {
      setTanques(tanquesActuales);
    } else {
      const cargarTanques = async () => {
        try {
          const { data } = await supabase.from('tanques').select('*').order('id', { ascending: true });
          if (data) setTanques(data);
        } catch (e) {
          console.warn('Aviso cargando tanques en operadores:', e);
        }
      };
      cargarTanques();
    }
  }, [tanquesActuales]);

  const cargarOperadores = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      // 1. Intentar obtener operadores con estadísticas y datos de perfil
      const [{ data: rpcData, error: rpcError }, { data: perfilesData }] = await Promise.all([
        supabase.rpc('obtener_operadores_dashboard'),
        supabase.from('perfiles').select('id, tanque_gasolina_id, tanque_diesel_id').eq('rol', 'operador')
      ]);

      if (rpcError) throw rpcError;

      const perfilesMap = (perfilesData || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});

      // Fusionar para asegurar que tanque_gasolina_id y tanque_diesel_id estén siempre disponibles
      const combinados = (rpcData || []).map((op) => ({
        ...op,
        tanque_gasolina_id: op.tanque_gasolina_id ?? perfilesMap[op.id]?.tanque_gasolina_id ?? null,
        tanque_diesel_id: op.tanque_diesel_id ?? perfilesMap[op.id]?.tanque_diesel_id ?? null
      }));

      setOperadores(combinados);
    } catch (err) {
      console.error('Error al obtener operadores:', err);
      setMensaje({ tipo: 'error', texto: err.message || 'Error al consultar operadores' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarOperadores();
  }, []);

  const cambiarEstado = async (id, nuevoEstado) => {
    setProcesandoId(id);
    try {
      const { error } = await supabase.rpc('cambiar_estado_operador', {
        p_operador_id: id,
        p_nuevo_estado: nuevoEstado
      });

      if (error) throw error;

      setOperadores((prev) =>
        prev.map((op) => (op.id === id ? { ...op, estado: nuevoEstado } : op))
      );
      setMensaje({ tipo: 'exito', texto: 'Operador actualizado con éxito.' });
    } catch (err) {
      console.error('Error al actualizar estado:', err);
      setMensaje({ tipo: 'error', texto: `Error al actualizar: ${err.message}` });
    } finally {
      setProcesandoId(null);
    }
  };

  const handleAsignarTanque = async (operadorId, tipo, tanqueIdStr) => {
    const op = operadores.find((o) => o.id === operadorId);
    if (!op) return;

    const parsedVal = tanqueIdStr ? parseInt(tanqueIdStr) : null;
    const nuevoGasolina = tipo === 'Gasolina' ? parsedVal : op.tanque_gasolina_id;
    const nuevoDiesel = tipo === 'Diesel' ? parsedVal : op.tanque_diesel_id;

    // Actualización inmediata en UI
    setOperadores((prev) =>
      prev.map((o) =>
        o.id === operadorId
          ? { ...o, tanque_gasolina_id: nuevoGasolina, tanque_diesel_id: nuevoDiesel }
          : o
      )
    );

    setGuardandoTanqueId(operadorId);
    try {
      // 1. Intentar vía RPC
      const { error: rpcErr } = await supabase.rpc('asignar_tanques_operador', {
        p_operador_id: operadorId,
        p_tanque_gasolina_id: nuevoGasolina,
        p_tanque_diesel_id: nuevoDiesel
      });

      if (rpcErr) {
        // 2. Fallback update directo en tabla perfiles
        const { error: directErr } = await supabase
          .from('perfiles')
          .update({
            tanque_gasolina_id: nuevoGasolina,
            tanque_diesel_id: nuevoDiesel
          })
          .eq('id', operadorId);

        if (directErr) throw directErr;
      }

      setMensaje({
        tipo: 'exito',
        texto: `Tanque de ${tipo} asignado a ${op.nombre_completo}.`
      });
    } catch (err) {
      console.error('Error al guardar asignación de tanque:', err);
      setMensaje({
        tipo: 'error',
        texto: `No se pudo asignar el tanque: ${err.message}`
      });
    } finally {
      setGuardandoTanqueId(null);
    }
  };

  const tanquesGasolina = tanques.filter((t) => t.producto === 'Gasolina');
  const tanquesDiesel = tanques.filter((t) => t.producto === 'Diesel');

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Operadores de la Estación</h2>
          <p className="text-xs text-slate-500 mt-1">
            Asigna los tanques de trabajo (Gasolina / Diesel) y aprueba nuevos operadores
          </p>
        </div>
        <button
          type="button"
          onClick={cargarOperadores}
          disabled={cargando}
          className="border border-slate-300 bg-white text-slate-700 px-3 py-2 rounded shadow-sm hover:bg-slate-50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          {cargando ? 'Actualizando...' : 'Actualizar lista'}
        </button>
      </div>

      {mensaje && (
        <div
          className={`p-3 mb-4 rounded-lg text-xs flex justify-between items-center ${
            mensaje.tipo === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            className="font-bold underline ml-3 cursor-pointer opacity-70 hover:opacity-100"
          >
            Descartar
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs tracking-wider">
            <tr>
              <th className="p-4 rounded-tl-lg">Nombre</th>
              <th className="p-4">Tanque Gasolina</th>
              <th className="p-4">Tanque Diesel</th>
              <th className="p-4 text-center">Ventas</th>
              <th className="p-4 text-right">Total cobrado</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center rounded-tr-lg">Acción</th>
            </tr>
          </thead>
          <tbody>
            {cargando && operadores.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  Cargando operadores...
                </td>
              </tr>
            ) : operadores.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  Todavía no hay operadores registrados.
                </td>
              </tr>
            ) : (
              operadores.map((op) => (
                <tr key={op.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-800">
                    <div>{op.nombre_completo}</div>
                    <div className="font-mono text-xs text-slate-400 mt-0.5">
                      {new Date(op.creado_en).toLocaleDateString('es-ES')}
                    </div>
                  </td>

                  {/* Selector Tanque Gasolina */}
                  <td className="p-4">
                    <select
                      value={op.tanque_gasolina_id || ''}
                      onChange={(e) => handleAsignarTanque(op.id, 'Gasolina', e.target.value)}
                      disabled={guardandoTanqueId === op.id}
                      className="border border-slate-300 rounded p-1.5 text-xs bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="">-- Sin asignar --</option>
                      {tanquesGasolina.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.codigo_tanque}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Selector Tanque Diesel */}
                  <td className="p-4">
                    <select
                      value={op.tanque_diesel_id || ''}
                      onChange={(e) => handleAsignarTanque(op.id, 'Diesel', e.target.value)}
                      disabled={guardandoTanqueId === op.id}
                      className="border border-slate-300 rounded p-1.5 text-xs bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="">-- Sin asignar --</option>
                      {tanquesDiesel.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.codigo_tanque}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-4 text-center font-bold text-slate-700">{op.total_ventas || 0}</td>
                  <td className="p-4 text-right font-bold text-green-600">
                    ${parseFloat(op.total_recaudado || 0).toFixed(2)}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                        op.estado === 'aprobado'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : op.estado === 'suspendido'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-orange-100 text-orange-700 border-orange-200'
                      }`}
                    >
                      {op.estado === 'aprobado' ? 'Activo' : op.estado === 'suspendido' ? 'Pausado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {op.estado !== 'aprobado' && (
                        <button
                          type="button"
                          onClick={() => cambiarEstado(op.id, 'aprobado')}
                          disabled={procesandoId === op.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {procesandoId === op.id ? '...' : 'Aprobar'}
                        </button>
                      )}
                      {op.estado !== 'suspendido' && (
                        <button
                          type="button"
                          onClick={() => cambiarEstado(op.id, 'suspendido')}
                          disabled={procesandoId === op.id}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {procesandoId === op.id ? '...' : 'Pausar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
