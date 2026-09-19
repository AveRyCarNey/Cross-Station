'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuditoriaFugas({ tanquesActuales = [] }) {
  const [tanquesLocales, setTanquesLocales] = useState([]);
  const [tanqueSeleccionado, setTanqueSeleccionado] = useState('');
  const [medicionFisica, setMedicionFisica] = useState('');
  const [resultado, setResultado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensajeBD, setMensajeBD] = useState(null);

  // Carga fallback si tanquesActuales no llega con datos
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
          console.error('Error cargando tanques en auditoria:', err);
        }
      };
      cargarTanques();
    }
  }, [tanquesActuales]);

  const tanquesDisponibles = (tanquesActuales && tanquesActuales.length > 0)
    ? tanquesActuales
    : tanquesLocales;

  const calcularDesviacion = async (e) => {
    e.preventDefault();
    setMensajeBD(null);

    const tanque = tanquesDisponibles.find((t) => t.id === parseInt(tanqueSeleccionado));
    if (!tanque) return;

    const fisico = parseFloat(medicionFisica);
    const teorico = parseFloat(tanque.volumen_actual);
    const diferencia = fisico - teorico; // Negativo implica pérdida/fuga

    // Tolerancia operativa: pérdida mayor a 50 L dispara alerta
    const hayFuga = diferencia < -50;

    const evaluacion = {
      tanqueId: tanque.id,
      codigoTanque: tanque.codigo_tanque,
      producto: tanque.producto,
      teorico: Number(teorico).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
      fisico: Number(fisico).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
      diferencia: (diferencia > 0 ? `+${diferencia.toFixed(2)}` : diferencia.toFixed(2)),
      alerta: hayFuga
    };

    setResultado(evaluacion);

    // Registro opcional en base de datos si existe sesión
    try {
      setGuardando(true);
      const { data: authData } = await supabase.auth.getUser();
      const gerenteId = authData?.user?.id;

      if (gerenteId) {
        const { error: insertError } = await supabase.from('aforos').insert([
          {
            gerente_id: gerenteId,
            tanque_id: tanque.id,
            volumen_teorico: teorico,
            volumen_fisico_medido: fisico,
            diferencia_detectada: parseFloat(diferencia.toFixed(2)),
            alerta_generada: hayFuga
          }
        ]);

        if (insertError) {
          console.warn('Aviso al insertar en tabla aforos:', insertError.message);
        } else {
          setMensajeBD('Medición con vara guardada con éxito.');
        }
      }
    } catch (dbErr) {
      console.warn('Registro en aforos omitido:', dbErr.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Panel de Registro */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-800">Medir con la Vara (Buscar Fugas)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Escribe la medida de la vara para ver si coincide con el sistema o si falta gasolina
          </p>
        </div>

        <form onSubmit={calcularDesviacion} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              ¿Qué tanque mediste?
            </label>
            <select
              required
              value={tanqueSeleccionado}
              onChange={(e) => setTanqueSeleccionado(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
            >
              <option value="">-- Elige un tanque --</option>
              {tanquesDisponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo_tanque} - {t.producto} (El sistema marca: {Number(t.volumen_actual).toLocaleString('es-ES')} L)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Litros que marcó la vara
            </label>
            <input
              type="number"
              required
              step="0.01"
              value={medicionFisica}
              onChange={(e) => setMedicionFisica(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              placeholder="Ej: 34500.00"
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-lg shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            {guardando ? 'Comprobando...' : 'Comprobar y Guardar'}
          </button>
        </form>

        {mensajeBD && (
          <p className="mt-3 text-xs text-slate-600 text-center font-medium">
            {mensajeBD}
          </p>
        )}
      </div>

      {/* Panel de Resultados / Alertas */}
      <div>
        {resultado ? (
          <div
            className={`p-6 rounded-xl shadow-sm border h-full flex flex-col justify-between ${
              resultado.alerta
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2
                  className={`text-xl font-bold ${
                    resultado.alerta ? 'text-red-700' : 'text-green-800'
                  }`}
                >
                  {resultado.alerta
                    ? '¡Alerta! Falta gasolina'
                    : '¡Todo en orden! Los números cuadran'}
                </h2>
                <span className="text-xs px-2.5 py-1 rounded font-semibold bg-white border border-slate-200 text-slate-700">
                  {resultado.codigoTanque} ({resultado.producto})
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-medium text-slate-600">Lo que dice el sistema:</span>
                  <span className="font-bold text-slate-800">{resultado.teorico} L</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-medium text-slate-600">Lo que midió la vara:</span>
                  <span className="font-bold text-slate-800">{resultado.fisico} L</span>
                </div>
                <div className="flex justify-between text-lg pt-2 items-baseline">
                  <span className="font-bold text-slate-700">Diferencia:</span>
                  <span
                    className={`font-black ${
                      resultado.alerta ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {resultado.diferencia} L
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-600">
              {resultado.alerta
                ? 'Faltan más de 50 litros según la vara. Revisa si hay una fuga en el tanque o si los surtidores están despachando de más.'
                : 'La diferencia es mínima y normal. No se detectan pérdidas ni fugas en este tanque.'}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-200 bg-white h-full flex flex-col items-center justify-center text-center">
            <div className="max-w-xs text-slate-500 text-sm">
              <h3 className="font-bold text-slate-700 mb-1">¿Hiciste medición con la vara?</h3>
              <p className="text-xs text-slate-500">
                Elige un tanque e introduce cuántos litros mediste con la vara para comprobar si falta combustible.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
