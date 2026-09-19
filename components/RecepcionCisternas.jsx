'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function RecepcionCisternas({ tanquesActuales = [], onRecargaExitosa }) {
  const [tanqueId, setTanqueId] = useState('');
  const [volumen, setVolumen] = useState('');
  const [guia, setGuia] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [tanquesLocales, setTanquesLocales] = useState([]);

  // Fallback si tanquesActuales no viene poblado inicialmente
  useEffect(() => {
    if (!tanquesActuales || tanquesActuales.length === 0) {
      const cargarTanques = async () => {
        try {
          const { data } = await supabase
            .from('tanques')
            .select('*')
            .order('id', { ascending: true });
          if (data) setTanquesLocales(data);
        } catch (err) {
          console.error('Error cargando tanques en recepción:', err);
        }
      };
      cargarTanques();
    }
  }, [tanquesActuales]);

  const tanquesDisponibles = (tanquesActuales && tanquesActuales.length > 0)
    ? tanquesActuales
    : tanquesLocales;

  const registrarRecarga = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: 'info', texto: 'Guardando llegada de combustible...' });
    setProcesando(true);

    try {
      // Extraer el UID del gerente conectado
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        throw new Error('Debes ser encargado para registrar la llegada de un camión.');
      }

      // Ejecutar la función RPC atómica
      const { error } = await supabase.rpc('registrar_recepcion_cisterna', {
        p_gerente_id: user.id,
        p_tanque_id: parseInt(tanqueId),
        p_volumen: parseFloat(volumen),
        p_guia: guia
      });

      if (error) {
        setMensaje({ tipo: 'error', texto: `No se pudo registrar la descarga: ${error.message}` });
      } else {
        setMensaje({ tipo: 'exito', texto: `¡Listo! Se sumaron ${parseFloat(volumen).toLocaleString('es-ES')} litros al tanque con éxito.` });
        setTanqueId('');
        setVolumen('');
        setGuia('');
        if (onRecargaExitosa) {
          onRecargaExitosa();
        }
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al guardar la llegada del camión.' });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-8">
      <div className="flex flex-wrap justify-between items-start mb-4 gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Recarga de Cisterna</h2>
          <p className="text-xs text-slate-500 mt-1">
            Anota el combustible que llegó en el camión para sumarlo al tanque
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
          Recarga de Cisterna
        </span>
      </div>
      
      <form onSubmit={registrarRecarga} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">¿A qué tanque entra?</label>
          <select 
            required
            value={tanqueId}
            onChange={(e) => setTanqueId(e.target.value)}
            disabled={procesando}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 disabled:bg-slate-100"
          >
            <option value="">Elige un tanque...</option>
            {tanquesDisponibles?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo_tanque} - {t.producto} (Tiene: {Number(t.volumen_actual).toLocaleString('es-ES')} L)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">¿Cuántos litros llegaron?</label>
          <input 
            type="number" 
            required
            step="0.01" 
            min="0.01"
            disabled={procesando}
            value={volumen}
            onChange={(e) => setVolumen(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 disabled:bg-slate-100" 
            placeholder="Ej: 15000.00" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Número de recibo o factura</label>
          <input 
            type="text" 
            required
            disabled={procesando}
            value={guia}
            onChange={(e) => setGuia(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 disabled:bg-slate-100" 
            placeholder="Ej: CIS-00492" 
          />
        </div>

        <div>
          <button 
            type="submit" 
            disabled={procesando}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-colors w-full cursor-pointer disabled:opacity-50 flex items-center justify-center text-sm"
            style={{ height: '42px', minHeight: '42px' }}
          >
            {procesando ? 'Guardando...' : 'Sumar Litros al Tanque'}
          </button>
        </div>
      </form>

      {mensaje && (
        <div className={`mt-4 p-3 text-sm rounded-lg flex items-center justify-between ${
          mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
          mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          <span>{mensaje.texto}</span>
          <button 
            type="button" 
            onClick={() => setMensaje(null)} 
            className="text-xs font-bold underline ml-3 opacity-75 hover:opacity-100 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
