'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function ConfiguracionReportes() {
  const [emailDestinatario, setEmailDestinatario] = useState('cross.station11@gmail.com');
  const [horaCorteDiario, setHoraCorteDiario] = useState('20:00');
  const [horaProgramadaGuardada, setHoraProgramadaGuardada] = useState('20:00');
  const [activo, setActivo] = useState(true);
  const [ultimoEnvio, setUltimoEnvio] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [horaActual, setHoraActual] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cronSecret = 'WuLliBer.11';
  const cronUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/reportes?secret=${cronSecret}&check_time=true`
    : `/api/reportes?secret=${cronSecret}&check_time=true`;

  const ultimoEnvioMinutoRef = useRef('');
  const horaGuardadaRef = useRef('20:00');
  const activoRef = useRef(true);

  // 1. Cargar configuración inicial (SOLO una vez al montar)
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  // Sincronizar ref de estado activo
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  // Cargar configuración guardada desde Supabase / API
  const cargarConfiguracion = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('configuracion_reportes')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        if (data.email_destinatario) setEmailDestinatario(data.email_destinatario);
        if (data.hora_corte_diario) {
          const h = data.hora_corte_diario.slice(0, 5);
          setHoraCorteDiario(h);
          setHoraProgramadaGuardada(h);
          horaGuardadaRef.current = h;
        }
        if (typeof data.activo === 'boolean') {
          setActivo(data.activo);
          activoRef.current = data.activo;
        }
        if (data.ultimo_envio) setUltimoEnvio(data.ultimo_envio);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

        const res = await fetch(`/api/reportes?secret=${cronSecret}&config=1`, { headers });
        const json = await res.json();
        if (json?.config) {
          if (json.config.email_destinatario) setEmailDestinatario(json.config.email_destinatario);
          if (json.config.hora_corte_diario) {
            const h = json.config.hora_corte_diario.slice(0, 5);
            setHoraCorteDiario(h);
            setHoraProgramadaGuardada(h);
            horaGuardadaRef.current = h;
          }
          if (typeof json.config.activo === 'boolean') {
            setActivo(json.config.activo);
            activoRef.current = json.config.activo;
          }
          if (json.config.ultimo_envio) setUltimoEnvio(json.config.ultimo_envio);
        }
      }
    } catch (err) {
      console.warn('Error al leer configuración de reportes:', err);
    } finally {
      setCargando(false);
    }
  };

  // 2. Reloj del sistema sincronizado con la estación (Venezuela / UTC-4)
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      let horaVzla = '';
      let hhmmVzla = '';
      let fechaHoyVzla = '';

      try {
        horaVzla = new Intl.DateTimeFormat('es-ES', {
          timeZone: 'America/Caracas',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(ahora);

        hhmmVzla = new Intl.DateTimeFormat('es-ES', {
          timeZone: 'America/Caracas',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(ahora);

        fechaHoyVzla = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Caracas',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(ahora);
      } catch (e) {
        horaVzla = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        hhmmVzla = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        fechaHoyVzla = ahora.toISOString().split('T')[0];
      }

      setHoraActual(horaVzla);

      if (
        activoRef.current &&
        hhmmVzla === horaGuardadaRef.current &&
        ultimoEnvioMinutoRef.current !== `${fechaHoyVzla}_${hhmmVzla}`
      ) {
        ultimoEnvioMinutoRef.current = `${fechaHoyVzla}_${hhmmVzla}`;
        ejecutarDisparoAutomatico();
      }
    };

    actualizarReloj();
    const interval = setInterval(actualizarReloj, 1000);
    return () => clearInterval(interval);
  }, []);

  const ejecutarDisparoAutomatico = async () => {
    try {
      const res = await fetch('/api/reportes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar_ahora',
          email_destinatario: emailDestinatario
        })
      });
      const data = await res.json();
      if (data.exito) {
        setUltimoEnvio(data.fecha_envio || new Date().toISOString());
        setMensaje({
          tipo: 'exito',
          texto: `Reporte diario enviado con éxito a ${emailDestinatario}`
        });
      }
    } catch (err) {
      console.error('Error en envío automático:', err);
    }
  };

  // 3. Guardar cambios en la configuración (Directo a Supabase + API)
  const handleGuardarConfig = async (e) => {
    e?.preventDefault();
    setGuardando(true);
    setMensaje(null);

    const horaCorta = horaCorteDiario.slice(0, 5);
    const horaNormalizada = horaCorta.length === 5 ? `${horaCorta}:00` : horaCorteDiario;

    try {
      // 1. Guardar de forma directa en Supabase (tabla configuracion_reportes)
      const { error: dbError } = await supabase
        .from('configuracion_reportes')
        .upsert({
          id: 1,
          email_destinatario: emailDestinatario.trim(),
          hora_corte_diario: horaNormalizada,
          activo,
          actualizado_en: new Date().toISOString()
        });

      if (dbError) {
        console.warn('Nota guardando en Supabase:', dbError.message);
      }

      // Actualizar estado de referencia guardado
      setHoraProgramadaGuardada(horaCorta);
      horaGuardadaRef.current = horaCorta;
      activoRef.current = activo;

      // 2. Sincronizar en el endpoint API
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      };

      await fetch('/api/reportes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'guardar_config',
          email_destinatario: emailDestinatario.trim(),
          hora_corte_diario: horaCorta,
          activo
        })
      });

      setMensaje({
        tipo: 'exito',
        texto: `¡Configuración guardada! El corte diario está programado a las ${horaCorta} (Hora de la estación).`
      });
    } catch (err) {
      console.error('Error al guardar configuración:', err);
      setMensaje({
        tipo: 'error',
        texto: `No se pudo guardar: ${err.message}`
      });
    } finally {
      setGuardando(false);
    }
  };

  // 4. Enviar correo de prueba inmediato
  const handleEnviarPrueba = async () => {
    setEnviandoPrueba(true);
    setMensaje(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      };

      const res = await fetch('/api/reportes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'enviar_ahora',
          email_destinatario: emailDestinatario.trim()
        })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'No se pudo enviar el correo');
      }

      setUltimoEnvio(data.fecha_envio || new Date().toISOString());
      setMensaje({
        tipo: 'exito',
        texto: `Correo de prueba enviado a ${data.destinatario || emailDestinatario}. Por favor revisa tu bandeja de entrada.`
      });
    } catch (err) {
      console.error('Error al enviar prueba:', err);
      setMensaje({
        tipo: 'error',
        texto: `Error al enviar correo: ${err.message}`
      });
    } finally {
      setEnviandoPrueba(false);
    }
  };

  const copiarAlPortapapeles = () => {
    navigator.clipboard.writeText(cronUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Banner de retroalimentación sin emojis */}
      {mensaje && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between border ${
            mensaje.tipo === 'exito'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {mensaje.tipo === 'exito' ? (
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <span className="text-sm font-medium">{mensaje.texto}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Cuadrícula de 2 columnas estilo sistema */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel Izquierdo: Formulario de Configuración */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-800">Configuración del Correo</h2>
            <p className="text-xs text-slate-500 mt-1">
              Ingresa el correo al que llegarán los datos y la hora en que deseas recibirlo
            </p>
          </div>

          <form onSubmit={handleGuardarConfig} className="space-y-4">
            {/* Campo 1: Correo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Correo destinatario
              </label>
              <input
                type="email"
                required
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                placeholder="ejemplo@gmail.com"
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                A este correo llegará el total de dinero cobrado y los litros vendidos en el día.
              </p>
            </div>

            {/* Campo 2: Hora de envío */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Hora de envío del reporte
              </label>
              <input
                type="time"
                required
                value={horaCorteDiario}
                onChange={(e) => setHoraCorteDiario(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 text-sm font-medium"
              />
              <p className="text-xs text-slate-500 mt-1">
                Hora a la que se generará y enviará el correo (por ejemplo: 20:00 para las 8:00 PM).
              </p>
            </div>

            {/* Campo 3: Envío automático activo/pausado */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Envío automático diario
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setActivo(true)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    activo
                      ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Activado
                </button>
                <button
                  type="button"
                  onClick={() => setActivo(false)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    !activo
                      ? 'bg-slate-100 border-slate-300 text-slate-800 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Pausado
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activo
                  ? 'El sistema enviará el reporte todos los días automáticamente.'
                  : 'Los envíos están pausados temporalmente.'}
              </p>
            </div>

            {/* Botón Guardar */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={guardando || cargando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg shadow-sm text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                {guardando ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Configuración</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Panel Derecho: Estado y Prueba Inmediata */}
        <div className="space-y-6">
          {/* Tarjeta de Resumen y Prueba */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Estado y Prueba</h2>
              <p className="text-xs text-slate-500 mt-1">
                Comprueba que el correo funcione antes de la hora programada
              </p>
            </div>

            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-600">Estado de envíos:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  activo
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {activo ? 'Activado' : 'Pausado'}
                </span>
              </div>

              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-600">Hora programada:</span>
                <span className="font-semibold text-slate-800">{horaProgramadaGuardada}</span>
              </div>

              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-600">Hora actual:</span>
                <span className="font-mono text-slate-700">{horaActual || '--:--:--'}</span>
              </div>

              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-600">Último envío realizado:</span>
                <span className="text-slate-800 text-xs">
                  {ultimoEnvio
                    ? new Date(ultimoEnvio).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Sin envíos registrados'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleEnviarPrueba}
                disabled={enviandoPrueba || cargando}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {enviandoPrueba ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Enviando correo de prueba...</span>
                  </>
                ) : (
                  <span>Enviar Correo de Prueba Ahora</span>
                )}
              </button>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Te enviará un correo de inmediato con las ventas registradas hasta este momento.
              </p>
            </div>
          </div>

          {/* Tarjeta de Programación Externa (Limpia y Sencilla) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">
              Enlace de programación externa (Opcional)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Si la computadora de la estación se apaga antes de la hora programada, puedes colocar este enlace en cualquier servicio de tareas automáticas para que se envíe sin necesidad de tener el navegador abierto:
            </p>

            <div className="flex rounded-lg shadow-sm">
              <input
                type="text"
                readOnly
                value={cronUrl}
                onClick={(e) => e.target.select()}
                className="block w-full min-w-0 flex-1 rounded-none rounded-l-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 outline-none select-all focus:border-blue-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={copiarAlPortapapeles}
                className={`inline-flex items-center gap-1.5 rounded-r-lg border border-l-0 border-slate-300 px-4 py-2 text-xs font-medium transition-colors cursor-pointer flex-shrink-0 ${
                  copiado
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {copiado ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
