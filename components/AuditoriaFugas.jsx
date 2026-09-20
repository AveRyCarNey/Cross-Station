'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// Conversión volumétrica geométrica para cilindro horizontal
function calcularLitrosDesdeCm(alturaCm, capacidadMax, diametroCm = 250) {
  if (!alturaCm || alturaCm <= 0) return 0;
  const h = Math.min(parseFloat(alturaCm), diametroCm);
  const r = diametroCm / 2;
  const cosVal = (r - h) / r;
  const factor = (Math.acos(cosVal) - cosVal * Math.sqrt(Math.max(0, 1 - Math.pow(cosVal, 2)))) / Math.PI;
  return parseFloat((capacidadMax * factor).toFixed(2));
}

export default function AuditoriaFugas({ tanquesActuales = [] }) {
  // Pestaña activa: 'medicion' | 'mantenimientos'
  const [tabActiva, setTabActiva] = useState('medicion');

  // Tanques
  const [tanquesLocales, setTanquesLocales] = useState([]);
  const [tanqueSeleccionado, setTanqueSeleccionado] = useState('');

  // Formulario Medición con Vara
  const [modoEntrada, setModoEntrada] = useState('cm'); // 'cm' o 'litros'
  const [alturaVaraCm, setAlturaVaraCm] = useState('');
  const [medicionFisicaLitros, setMedicionFisicaLitros] = useState('');
  const [diametroTanqueCm, setDiametroTanqueCm] = useState('250');
  const [alturaAguaCm, setAlturaAguaCm] = useState('0');
  const [tipoRegistro, setTipoRegistro] = useState('rutina');
  const [notasAforo, setNotasAforo] = useState('');
  const [guardandoAforo, setGuardandoAforo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [mensajeAforo, setMensajeAforo] = useState(null);

  // Historial de Aforos
  const [historialAforos, setHistorialAforos] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Formulario Mantenimientos
  const [tanqueMantenimiento, setTanqueMantenimiento] = useState('');
  const [tipoMantenimiento, setTipoMantenimiento] = useState('purga_agua');
  const [tecnicoMantenimiento, setTecnicoMantenimiento] = useState('');
  const [costoMantenimiento, setCostoMantenimiento] = useState('');
  const [observacionesMantenimiento, setObservacionesMantenimiento] = useState('');
  const [bloquearDespacho, setBloquearDespacho] = useState(false);
  const [guardandoMantenimiento, setGuardandoMantenimiento] = useState(false);
  const [mensajeMantenimiento, setMensajeMantenimiento] = useState(null);

  // Lista de Mantenimientos
  const [listaMantenimientos, setListaMantenimientos] = useState([]);
  const [cargandoMantenimientos, setCargandoMantenimientos] = useState(false);
  const [filtroEstadoMantenimiento, setFiltroEstadoMantenimiento] = useState('todos');

  // Carga fallback de tanques
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
          console.error('Error cargando tanques:', err);
        }
      };
      cargarTanques();
    }
  }, [tanquesActuales]);

  const tanquesDisponibles = (tanquesActuales && tanquesActuales.length > 0)
    ? tanquesActuales
    : tanquesLocales;

  const tanqueObj = useMemo(() => {
    return tanquesDisponibles.find((t) => t.id === parseInt(tanqueSeleccionado));
  }, [tanquesDisponibles, tanqueSeleccionado]);

  // Conversión automática de cm a litros
  useEffect(() => {
    if (modoEntrada === 'cm' && tanqueObj && alturaVaraCm !== '') {
      const litros = calcularLitrosDesdeCm(
        alturaVaraCm,
        parseFloat(tanqueObj.capacidad_maxima),
        parseFloat(diametroTanqueCm || 250)
      );
      setMedicionFisicaLitros(litros > 0 ? litros.toString() : '0');
    }
  }, [modoEntrada, alturaVaraCm, tanqueObj, diametroTanqueCm]);

  // Carga de historial
  const cargarHistorial = async (idTanque) => {
    setCargandoHistorial(true);
    try {
      let query = supabase
        .from('aforos')
        .select('*')
        .order('fecha_medicion', { ascending: false })
        .limit(10);

      if (idTanque) {
        query = query.eq('tanque_id', parseInt(idTanque));
      }

      const { data, error } = await query;
      if (!error && data) {
        setHistorialAforos(data);
      }
    } catch (err) {
      console.warn('Historial no disponible:', err);
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Carga de mantenimientos
  const cargarMantenimientos = async () => {
    setCargandoMantenimientos(true);
    try {
      const { data, error } = await supabase
        .from('mantenimientos_tanque')
        .select('*, tanques(codigo_tanque, producto)')
        .order('fecha_inicio', { ascending: false });

      if (!error && data) {
        setListaMantenimientos(data);
      }
    } catch (err) {
      console.warn('Tabla mantenimientos_tanque no disponible aún:', err);
    } finally {
      setCargandoMantenimientos(false);
    }
  };

  useEffect(() => {
    cargarHistorial(tanqueSeleccionado);
  }, [tanqueSeleccionado]);

  useEffect(() => {
    cargarMantenimientos();
  }, []);

  // Handler: Calcular Desviación y Guardar
  const calcularDesviacion = async (e) => {
    e.preventDefault();
    setMensajeAforo(null);

    if (!tanqueObj) {
      setMensajeAforo({ tipo: 'error', texto: 'Selecciona un tanque primero.' });
      return;
    }

    const fisico = parseFloat(medicionFisicaLitros);
    if (isNaN(fisico) || fisico < 0) {
      setMensajeAforo({ tipo: 'error', texto: 'Ingresa un volumen válido en litros o centímetros.' });
      return;
    }

    const teorico = parseFloat(tanqueObj.volumen_actual);
    const diferencia = fisico - teorico;
    const porcentajeDesviacion = teorico > 0 ? ((diferencia / teorico) * 100) : 0;
    const cmAgua = parseFloat(alturaAguaCm) || 0;

    const hayFuga = diferencia < -50 || porcentajeDesviacion < -0.5;
    const alertaAgua = cmAgua > 2.5;
    const avisoAgua = cmAgua > 0 && cmAgua <= 2.5;

    const evaluacion = {
      tanqueId: tanqueObj.id,
      codigoTanque: tanqueObj.codigo_tanque,
      producto: tanqueObj.producto,
      teorico: Number(teorico).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
      fisico: Number(fisico).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
      alturaCm: modoEntrada === 'cm' ? parseFloat(alturaVaraCm) : null,
      aguaCm: cmAgua,
      diferenciaLitros: diferencia,
      diferenciaStr: (diferencia > 0 ? `+${diferencia.toFixed(2)}` : diferencia.toFixed(2)),
      porcentajeStr: `${porcentajeDesviacion > 0 ? '+' : ''}${porcentajeDesviacion.toFixed(2)}%`,
      alertaFuga: hayFuga,
      alertaAgua: alertaAgua,
      avisoAgua: avisoAgua,
      tipoRegistro: tipoRegistro,
      fecha: new Date().toLocaleString('es-ES')
    };

    setResultado(evaluacion);

    try {
      setGuardandoAforo(true);
      const { data: authData } = await supabase.auth.getUser();
      const gerenteId = authData?.user?.id;

      if (gerenteId) {
        const registroCompleto = {
          gerente_id: gerenteId,
          tanque_id: tanqueObj.id,
          volumen_teorico: teorico,
          volumen_fisico_medido: fisico,
          diferencia_detectada: parseFloat(diferencia.toFixed(2)),
          alerta_generada: hayFuga || alertaAgua,
          altura_vara_cm: modoEntrada === 'cm' ? parseFloat(alturaVaraCm) : null,
          altura_agua_cm: cmAgua,
          tipo_registro: tipoRegistro,
          notas: notasAforo || null
        };

        let { error: insertError } = await supabase.from('aforos').insert([registroCompleto]);

        if (insertError && insertError.message.includes('column')) {
          const registroBase = {
            gerente_id: gerenteId,
            tanque_id: tanqueObj.id,
            volumen_teorico: teorico,
            volumen_fisico_medido: fisico,
            diferencia_detectada: parseFloat(diferencia.toFixed(2)),
            alerta_generada: hayFuga
          };
          const { error: fallbackError } = await supabase.from('aforos').insert([registroBase]);
          if (fallbackError) throw fallbackError;
          setMensajeAforo({
            tipo: 'aviso',
            texto: 'Guardado con esquema básico. Recuerda ejecutar docs/fugas_mantenimientos.sql para persistir datos extendidos.'
          });
        } else if (insertError) {
          if (insertError.message?.includes('row-level security') || insertError.code === '42501') {
            const itemLocal = {
              ...registroCompleto,
              id: Date.now(),
              fecha_medicion: new Date().toISOString()
            };
            setHistorialAforos((prev) => [itemLocal, ...prev]);
            setMensajeAforo({
              tipo: 'aviso',
              texto: 'Guardado en memoria local. Ejecuta la sección RLS de docs/fugas_mantenimientos.sql en Supabase para persistencia.'
            });
          } else {
            throw insertError;
          }
        } else {
          setMensajeAforo({
            tipo: 'exito',
            texto: 'Medición registrada y guardada exitosamente.'
          });
          cargarHistorial(tanqueObj.id);
        }
      } else {
        const itemLocal = {
          tanque_id: tanqueObj.id,
          volumen_teorico: teorico,
          volumen_fisico_medido: fisico,
          diferencia_detectada: parseFloat(diferencia.toFixed(2)),
          alerta_generada: hayFuga || alertaAgua,
          altura_vara_cm: modoEntrada === 'cm' ? parseFloat(alturaVaraCm) : null,
          altura_agua_cm: cmAgua,
          tipo_registro: tipoRegistro,
          notas: notasAforo || null,
          id: Date.now(),
          fecha_medicion: new Date().toISOString()
        };
        setHistorialAforos((prev) => [itemLocal, ...prev]);
        setMensajeAforo({
          tipo: 'aviso',
          texto: 'Medición calculada en memoria local (sesión de usuario no detectada).'
        });
      }
    } catch (err) {
      console.warn('Error guardando aforo:', err);
      setMensajeAforo({
        tipo: 'error',
        texto: `Error al persistir en base de datos: ${err.message || 'Fallo de conexión'}`
      });
    } finally {
      setGuardandoAforo(false);
    }
  };

  // Handler: Registrar Mantenimiento
  const registrarMantenimiento = async (e) => {
    e.preventDefault();
    setMensajeMantenimiento(null);

    if (!tanqueMantenimiento) {
      setMensajeMantenimiento({ tipo: 'error', texto: 'Selecciona un tanque.' });
      return;
    }

    try {
      setGuardandoMantenimiento(true);
      const { data: authData } = await supabase.auth.getUser();
      const gerenteId = authData?.user?.id;

      const nuevoMantenimiento = {
        tanque_id: parseInt(tanqueMantenimiento),
        gerente_id: gerenteId || null,
        tipo: tipoMantenimiento,
        tecnico_responsable: tecnicoMantenimiento || null,
        costo: costoMantenimiento ? parseFloat(costoMantenimiento) : 0,
        observaciones: observacionesMantenimiento || null,
        bloquear_despacho: bloquearDespacho,
        estado: 'en_proceso'
      };

      const { data, error } = await supabase
        .from('mantenimientos_tanque')
        .insert([nuevoMantenimiento])
        .select('*, tanques(codigo_tanque, producto)');

      if (error) {
        const tanqueAsociado = tanquesDisponibles.find((t) => t.id === parseInt(tanqueMantenimiento));
        const itemLocal = {
          ...nuevoMantenimiento,
          id: Date.now(),
          fecha_inicio: new Date().toISOString(),
          tanques: {
            codigo_tanque: tanqueAsociado?.codigo_tanque || 'TANQUE',
            producto: tanqueAsociado?.producto || 'Combustible'
          }
        };
        setListaMantenimientos((prev) => [itemLocal, ...prev]);
        setMensajeMantenimiento({
          tipo: 'aviso',
          texto: 'Registrado en memoria local. Ejecuta docs/fugas_mantenimientos.sql para persistencia.'
        });
      } else {
        if (data && data.length > 0) {
          setListaMantenimientos((prev) => [data[0], ...prev]);
        } else {
          cargarMantenimientos();
        }
        setMensajeMantenimiento({
          tipo: 'exito',
          texto: 'Mantenimiento registrado correctamente.'
        });
      }

      setTecnicoMantenimiento('');
      setCostoMantenimiento('');
      setObservacionesMantenimiento('');
      setBloquearDespacho(false);
    } catch (err) {
      console.warn('Error al registrar mantenimiento:', err);
      setMensajeMantenimiento({ tipo: 'error', texto: err.message });
    } finally {
      setGuardandoMantenimiento(false);
    }
  };

  // Handler: Finalizar Mantenimiento
  const finalizarMantenimiento = async (idMantenimiento) => {
    try {
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from('mantenimientos_tanque')
        .update({ estado: 'completado', fecha_fin: ahora, bloquear_despacho: false })
        .eq('id', idMantenimiento);

      if (error) {
        console.warn('Actualización local de mantenimiento:', error.message);
      }

      setListaMantenimientos((prev) =>
        prev.map((m) =>
          m.id === idMantenimiento
            ? { ...m, estado: 'completado', fecha_fin: ahora, bloquear_despacho: false }
            : m
        )
      );
    } catch (err) {
      console.error('Error al finalizar mantenimiento:', err);
    }
  };

  const mantenimientosFiltrados = useMemo(() => {
    if (filtroEstadoMantenimiento === 'todos') return listaMantenimientos;
    return listaMantenimientos.filter((m) => m.estado === filtroEstadoMantenimiento);
  }, [listaMantenimientos, filtroEstadoMantenimiento]);

  return (
    <div className="space-y-6">
      {/* Navegación por pestañas estilo sistema */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setTabActiva('medicion')}
          className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-lg text-sm transition-all cursor-pointer ${
            tabActiva === 'medicion'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-200 font-bold'
              : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200 font-medium'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="whitespace-nowrap">Control de Medidas y Fugas</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('mantenimientos')}
          className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-lg text-sm transition-all cursor-pointer ${
            tabActiva === 'mantenimientos'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-200 font-bold'
              : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200 font-medium'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="whitespace-nowrap">Mantenimiento de Tanques</span>
          {listaMantenimientos.filter((m) => m.estado === 'en_proceso').length > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {listaMantenimientos.filter((m) => m.estado === 'en_proceso').length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================= */}
      {/* PESTAÑA 1: MEDICIÓN CON VARA Y CONTROL DE FUGAS */}
      {/* ========================================================= */}
      {tabActiva === 'medicion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Panel de Registro */}
            <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-800">Aforo Físico con Vara</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Introduce la lectura física de la vara y el corte de agua para auditar desviaciones e identificar posibles fugas.
                </p>
              </div>

              <form onSubmit={calcularDesviacion} className="space-y-4">
                {/* Selector de Tanque */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tanque a auditar <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={tanqueSeleccionado}
                    onChange={(e) => setTanqueSeleccionado(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
                  >
                    <option value="">-- Seleccionar tanque --</option>
                    {tanquesDisponibles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo_tanque} - {t.producto} (Teórico: {Number(t.volumen_actual).toLocaleString('es-ES')} L | Cap: {Number(t.capacidad_maxima).toLocaleString('es-ES')} L)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modo de Entrada */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-700">Método de Medición:</span>
                    <div className="inline-flex rounded-lg p-1 bg-slate-200 text-xs font-medium gap-1">
                      <button
                        type="button"
                        onClick={() => setModoEntrada('cm')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          modoEntrada === 'cm'
                            ? 'bg-white text-slate-800 font-bold shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Centímetros (cm)
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoEntrada('litros')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          modoEntrada === 'litros'
                            ? 'bg-white text-slate-800 font-bold shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Litros Directos (L)
                      </button>
                    </div>
                  </div>

                  {modoEntrada === 'cm' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Altura de Combustible (cm)
                        </label>
                        <input
                          type="number"
                          required
                          step="0.1"
                          min="0"
                          max={diametroTanqueCm || 300}
                          value={alturaVaraCm}
                          onChange={(e) => setAlturaVaraCm(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
                          placeholder="Ej: 145.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Diámetro Tanque (cm)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={diametroTanqueCm}
                          onChange={(e) => setDiametroTanqueCm(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
                          placeholder="Estándar: 250"
                        />
                      </div>
                      {alturaVaraCm && tanqueObj && (
                        <div className="sm:col-span-2 text-xs text-blue-800 bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                          Volumen físico estimado: <strong>{Number(medicionFisicaLitros || 0).toLocaleString('es-ES')} L</strong> ({((parseFloat(medicionFisicaLitros) / parseFloat(tanqueObj.capacidad_maxima)) * 100).toFixed(1)}% capacidad)
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Litros según tabla de aforo (L)
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        value={medicionFisicaLitros}
                        onChange={(e) => setMedicionFisicaLitros(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
                        placeholder="Ej: 24500.00"
                      />
                    </div>
                  )}
                </div>

                {/* Detección de Agua */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Corte de Agua (cm) - Pasta reactiva en punta de vara:
                    </label>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded font-bold ${
                        parseFloat(alturaAguaCm) > 2.5
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : parseFloat(alturaAguaCm) > 0
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {parseFloat(alturaAguaCm) > 2.5
                        ? 'Alerta Crítica (> 2.5 cm)'
                        : parseFloat(alturaAguaCm) > 0
                        ? 'Presencia de Agua'
                        : 'Sin agua en fondo'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={alturaAguaCm}
                    onChange={(e) => setAlturaAguaCm(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
                    placeholder="0.0"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tolerancia normativa: lecturas superiores a 2.5 cm requieren purga de fondo inmediata.
                  </p>
                </div>

                {/* Motivo de Medición y Observaciones */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Motivo de Medición
                    </label>
                    <select
                      value={tipoRegistro}
                      onChange={(e) => setTipoRegistro(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="rutina">Rutina de control de turno</option>
                      <option value="post_descarga">Post-descarga de cisterna</option>
                      <option value="mantenimiento">Pre / Post Mantenimiento</option>
                      <option value="calibracion">Calibración / Prueba técnica</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Observaciones
                    </label>
                    <input
                      type="text"
                      value={notasAforo}
                      onChange={(e) => setNotasAforo(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Precintos, condiciones, etc."
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={guardandoAforo}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 text-sm"
                  >
                    {guardandoAforo ? 'Analizando y Guardando...' : 'Comprobar Desviación y Guardar'}
                  </button>
                </div>
              </form>

              {mensajeAforo && (
                <div
                  className={`mt-4 p-3.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
                    mensajeAforo.tipo === 'exito'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : mensajeAforo.tipo === 'aviso'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span>{mensajeAforo.texto}</span>
                  <button
                    type="button"
                    onClick={() => setMensajeAforo(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold ml-2"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

            {/* Panel de Diagnóstico Visual */}
            <div className="lg:col-span-5">
              {resultado ? (
                <div
                  className={`p-6 rounded-xl shadow-sm border h-full flex flex-col justify-between ${
                    resultado.alertaFuga || resultado.alertaAgua
                      ? 'bg-rose-50/70 border-rose-200'
                      : resultado.avisoAgua
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2
                          className={`text-xl font-bold ${
                            resultado.alertaFuga || resultado.alertaAgua
                              ? 'text-rose-700'
                              : resultado.avisoAgua
                              ? 'text-amber-800'
                              : 'text-emerald-800'
                          }`}
                        >
                          {resultado.alertaFuga
                            ? 'Alerta de Fuga / Pérdida'
                            : resultado.alertaAgua
                            ? 'Alerta: Agua en Fondo'
                            : resultado.avisoAgua
                            ? 'Atención: Condensación'
                            : 'Medición Conforme'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">{resultado.fecha}</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-md font-semibold bg-white border border-slate-200 text-slate-700">
                        {resultado.codigoTanque} ({resultado.producto})
                      </span>
                    </div>

                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-medium text-slate-600">Sistema (Teórico):</span>
                        <span className="font-bold text-slate-800">{resultado.teorico} L</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-medium text-slate-600">Medición con Vara (Físico):</span>
                        <span className="font-bold text-slate-800">{resultado.fisico} L</span>
                      </div>
                      {resultado.alturaCm !== null && (
                        <div className="flex justify-between border-b border-slate-200/80 pb-2">
                          <span className="font-medium text-slate-600">Altura de Combustible:</span>
                          <span className="font-semibold text-slate-700">{resultado.alturaCm} cm</span>
                        </div>
                      )}
                      <div className="flex justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-medium text-slate-600">Corte de Agua:</span>
                        <span
                          className={`font-bold ${
                            resultado.aguaCm > 2.5
                              ? 'text-rose-600'
                              : resultado.aguaCm > 0
                              ? 'text-amber-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {resultado.aguaCm} cm
                        </span>
                      </div>
                      <div className="flex justify-between text-lg pt-2 items-baseline">
                        <span className="font-bold text-slate-700">Diferencia Neta:</span>
                        <div className="text-right">
                          <div
                            className={`font-black ${
                              resultado.alertaFuga
                                ? 'text-rose-600'
                                : resultado.diferenciaLitros >= 0
                                ? 'text-emerald-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {resultado.diferenciaStr} L
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            {resultado.porcentajeStr}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-700 space-y-2">
                    {resultado.alertaFuga && (
                      <p className="font-medium text-rose-700">
                        La pérdida excede los 50 L o el límite de tolerancia reglamentario de 0.5%. Inspeccionar líneas de succión, hermeticidad de tanque o calibración en surtidores.
                      </p>
                    )}
                    {resultado.alertaAgua && (
                      <p className="font-medium text-rose-700">
                        Corte de agua crítico ({resultado.aguaCm} cm). Programar purga de fondo urgente para prevenir suministro de agua a vehículos.
                      </p>
                    )}
                    {!resultado.alertaFuga && !resultado.alertaAgua && (
                      <p className="text-emerald-800">
                        Diferencia dentro de las tolerancias normales de inventario y evaporación. Tanque en condiciones operativas estables.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-slate-200 bg-white h-full flex flex-col items-center justify-center text-center">
                  <div className="max-w-xs text-slate-500 text-sm">
                    <div
                      className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 flex-shrink-0"
                      style={{ width: '48px', height: '48px' }}
                    >
                      <svg
                        className="w-6 h-6"
                        style={{ width: '24px', height: '24px' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-slate-700 mb-1">Auditoría en Espera</h3>
                    <p className="text-xs text-slate-500">
                      Selecciona un tanque e ingresa la medición de vara para evaluar desviaciones volumétricas y corte de agua.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Historial Reciente de Aforos */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Historial de Aforos Físicos</h3>
                <p className="text-xs text-slate-500">Registro histórico de auditorías realizadas</p>
              </div>
              <button
                type="button"
                onClick={() => cargarHistorial(tanqueSeleccionado)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Actualizar
              </button>
            </div>

            {cargandoHistorial ? (
              <p className="text-xs text-slate-500 py-4 text-center">Cargando mediciones...</p>
            ) : historialAforos.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No hay mediciones registradas para este tanque.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Tanque</th>
                      <th className="p-3">Vara (cm)</th>
                      <th className="p-3">Vol. Físico (L)</th>
                      <th className="p-3">Vol. Sistema (L)</th>
                      <th className="p-3">Desviación</th>
                      <th className="p-3">Agua (cm)</th>
                      <th className="p-3">Motivo</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historialAforos.map((aforo) => {
                      const tanque = tanquesDisponibles.find((t) => t.id === aforo.tanque_id);
                      return (
                        <tr key={aforo.id} className="hover:bg-slate-50">
                          <td className="p-3 whitespace-nowrap">
                            {new Date(aforo.fecha_medicion).toLocaleString('es-ES', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {tanque ? `${tanque.codigo_tanque} (${tanque.producto})` : `#${aforo.tanque_id}`}
                          </td>
                          <td className="p-3">
                            {aforo.altura_vara_cm ? `${aforo.altura_vara_cm} cm` : '-'}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {Number(aforo.volumen_fisico_medido).toLocaleString('es-ES')} L
                          </td>
                          <td className="p-3">
                            {Number(aforo.volumen_teorico).toLocaleString('es-ES')} L
                          </td>
                          <td
                            className={`p-3 font-bold ${
                              parseFloat(aforo.diferencia_detectada) < -50
                                ? 'text-rose-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {parseFloat(aforo.diferencia_detectada) > 0 ? '+' : ''}
                            {aforo.diferencia_detectada} L
                          </td>
                          <td className="p-3">
                            {parseFloat(aforo.altura_agua_cm || 0) > 2.5 ? (
                              <span className="text-rose-600 font-bold">{aforo.altura_agua_cm} cm</span>
                            ) : parseFloat(aforo.altura_agua_cm || 0) > 0 ? (
                              <span className="text-amber-600 font-bold">{aforo.altura_agua_cm} cm</span>
                            ) : (
                              <span className="text-slate-400">0.0 cm</span>
                            )}
                          </td>
                          <td className="p-3 capitalize">
                            {aforo.tipo_registro || 'rutina'}
                          </td>
                          <td className="p-3">
                            {aforo.alerta_generada ? (
                              <span className="bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-bold">
                                Alerta Fuga
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                                Conforme
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: GESTIÓN DE MANTENIMIENTO DE TANQUES */}
      {/* ========================================================= */}
      {tabActiva === 'mantenimientos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulario Programar Mantenimiento */}
            <div className="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-800">Programar Mantenimiento</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Registra servicios preventivos, purgas de agua en fondo o pruebas técnicas de hermeticidad.
                </p>
              </div>

              <form onSubmit={registrarMantenimiento} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tanque a intervenir <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={tanqueMantenimiento}
                    onChange={(e) => setTanqueMantenimiento(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Seleccionar tanque --</option>
                    {tanquesDisponibles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo_tanque} - {t.producto}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tipo de Servicio <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={tipoMantenimiento}
                    onChange={(e) => setTipoMantenimiento(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="purga_agua">Drenaje / Purga de agua en fondo</option>
                    <option value="limpieza_fondo">Limpieza integral de borras y lodos</option>
                    <option value="prueba_estanqueidad">Prueba de estanqueidad acústica</option>
                    <option value="calibracion_vara">Calibración de vara / tabla de aforo</option>
                    <option value="inspeccion_valvulas">Inspección de válvulas de venteo y sobrellenado</option>
                    <option value="otro">Otro servicio técnico</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Técnico / Empresa
                    </label>
                    <input
                      type="text"
                      value={tecnicoMantenimiento}
                      onChange={(e) => setTecnicoMantenimiento(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Empresa o técnico"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Costo Estimado ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costoMantenimiento}
                      onChange={(e) => setCostoMantenimiento(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Detalles y Observaciones
                  </label>
                  <textarea
                    rows={2}
                    value={observacionesMantenimiento}
                    onChange={(e) => setObservacionesMantenimiento(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Descripción del trabajo, hallazgos..."
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <input
                    type="checkbox"
                    id="bloquearDespacho"
                    checked={bloquearDespacho}
                    onChange={(e) => setBloquearDespacho(e.target.checked)}
                    className="h-4 w-4 text-amber-600 rounded border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="bloquearDespacho" className="text-xs font-medium text-amber-900 cursor-pointer">
                    Pausar despacho en surtidores durante la intervención
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={guardandoMantenimiento}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 text-sm"
                  >
                    {guardandoMantenimiento ? 'Registrando...' : 'Registrar Mantenimiento'}
                  </button>
                </div>
              </form>

              {mensajeMantenimiento && (
                <div
                  className={`mt-4 p-3.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
                    mensajeMantenimiento.tipo === 'exito'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : mensajeMantenimiento.tipo === 'aviso'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span>{mensajeMantenimiento.texto}</span>
                  <button
                    type="button"
                    onClick={() => setMensajeMantenimiento(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold ml-2"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

            {/* Lista de Mantenimientos */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Intervenciones en Tanques</h3>
                    <p className="text-xs text-slate-500">Historial y estado de los servicios programados</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={filtroEstadoMantenimiento}
                      onChange={(e) => setFiltroEstadoMantenimiento(e.target.value)}
                      className="border border-slate-300 rounded-lg p-2 text-xs bg-white text-slate-700 outline-none"
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="en_proceso">En proceso</option>
                      <option value="completado">Completados</option>
                    </select>
                    <button
                      type="button"
                      onClick={cargarMantenimientos}
                      className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                      title="Actualizar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {cargandoMantenimientos ? (
                  <p className="text-xs text-slate-500 py-6 text-center">Cargando intervenciones...</p>
                ) : mantenimientosFiltrados.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    No hay registros de mantenimientos con el filtro seleccionado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mantenimientosFiltrados.map((m) => {
                      const nombreTanque = m.tanques?.codigo_tanque
                        ? `${m.tanques.codigo_tanque} (${m.tanques.producto})`
                        : `Tanque #${m.tanque_id}`;

                      return (
                        <div
                          key={m.id}
                          className={`p-4 rounded-xl border transition-all ${
                            m.estado === 'en_proceso'
                              ? 'bg-amber-50/40 border-amber-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-800">
                                  {nombreTanque}
                                </span>
                                <span
                                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                                    m.estado === 'en_proceso'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {m.estado === 'en_proceso' ? 'En Proceso' : 'Completado'}
                                </span>
                                {m.bloquear_despacho && m.estado === 'en_proceso' && (
                                  <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold">
                                    Despacho Pausado
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 font-medium mt-1">
                                {m.tipo === 'purga_agua' && 'Drenaje / Purga de agua en fondo'}
                                {m.tipo === 'limpieza_fondo' && 'Limpieza de lodos y borras'}
                                {m.tipo === 'prueba_estanqueidad' && 'Prueba de estanqueidad acústica'}
                                {m.tipo === 'calibracion_vara' && 'Calibración de vara y telemedición'}
                                {m.tipo === 'inspeccion_valvulas' && 'Inspección de válvulas de venteo'}
                                {m.tipo === 'otro' && 'Otro servicio técnico'}
                              </p>
                            </div>

                            {m.estado === 'en_proceso' && (
                              <button
                                type="button"
                                onClick={() => finalizarMantenimiento(m.id)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                              >
                                Finalizar
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                            <div>
                              <span className="text-slate-400 block">Inicio:</span>
                              {new Date(m.fecha_inicio).toLocaleDateString('es-ES')}
                            </div>
                            {m.fecha_fin && (
                              <div>
                                <span className="text-slate-400 block">Fin:</span>
                                {new Date(m.fecha_fin).toLocaleDateString('es-ES')}
                              </div>
                            )}
                            <div>
                              <span className="text-slate-400 block">Técnico:</span>
                              {m.tecnico_responsable || 'No especificado'}
                            </div>
                            {parseFloat(m.costo || 0) > 0 && (
                              <div>
                                <span className="text-slate-400 block">Costo:</span>
                                ${Number(m.costo).toFixed(2)}
                              </div>
                            )}
                          </div>

                          {m.observaciones && (
                            <p className="mt-2.5 text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              {m.observaciones}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
