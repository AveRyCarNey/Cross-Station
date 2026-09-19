'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import VentasDiarias from '@/components/VentasDiarias';
import AuditoriaFugas from '@/components/AuditoriaFugas';
import RecepcionCisternas from '@/components/RecepcionCisternas';
import GestionOperadores from '@/components/GestionOperadores';

export default function DashboardGerente() {
  const [tanques, setTanques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vistaActiva, setVistaActiva] = useState('dashboard'); // 'dashboard' | 'ventas' | 'auditoria' | 'operadores'

  // Estados para la proyección total de la estación
  const [proyeccionTotal, setProyeccionTotal] = useState(null);
  const [isLoadingIA, setIsLoadingIA] = useState(false);
  const [errorIA, setErrorIA] = useState(null);

  // Estados para gestión de precios de combustible
  const [precioGasolina, setPrecioGasolina] = useState('0.50');
  const [precioDiesel, setPrecioDiesel] = useState('0.45');
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);
  const [mensajePrecios, setMensajePrecios] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Generador de Reporte Gerencial en PDF
  const handleDescargarReportePDF = async () => {
    setGenerandoPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // 1. Obtener ventas de hoy para el reporte
      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date();
      hoyFin.setHours(23, 59, 59, 999);

      const { data: ventasData } = await supabase
        .from('ventas')
        .select('*, tanques(codigo_tanque, producto)')
        .gte('fecha_registro', hoyInicio.toISOString())
        .lte('fecha_registro', hoyFin.toISOString());

      const ventas = ventasData || [];
      const totalLitrosHoy = ventas.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
      const totalMontoHoy = ventas.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
      const efectivo = ventas.filter((v) => v.metodo_pago === 'Efectivo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
      const tarjeta = ventas.filter((v) => v.metodo_pago === 'Tarjeta').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
      const pagoMovil = ventas.filter((v) => v.metodo_pago === 'Pago Movil').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
      const vales = ventas.filter((v) => v.metodo_pago === 'Vale Corporativo').reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);

      // 2. ENCABEZADO INSTITUCIONAL
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('CROSS-STATION ERP', 14, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('REPORTE GENERAL DE ESTACIÓN Y BALANCE DE INVENTARIO', 14, 18);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      const fechaStr = new Date().toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      doc.text(`Emisión: ${fechaStr}`, 196, 15, { align: 'right' });

      let y = 34;

      // 3. SECCIÓN 1: PRECIOS OFICIALES VIGENTES
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('1. Precios Oficiales Vigentes', 14, y);
      y += 5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, y, 182, 14, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Gasolina:', 20, y + 9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105); // verde
      doc.text(`$${Number(precioGasolina).toFixed(2)} / Litro`, 40, y + 9);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Diesel:', 110, y + 9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235); // azul
      doc.text(`$${Number(precioDiesel).toFixed(2)} / Litro`, 126, y + 9);

      y += 22;

      // 4. SECCIÓN 2: INVENTARIO FÍSICO DE TANQUES
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('2. Inventario Físico de Tanques', 14, y);
      y += 5;

      // Tabla encabezado
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('TANQUE', 18, y + 5);
      doc.text('COMBUSTIBLE', 45, y + 5);
      doc.text('CAPACIDAD MÁX.', 90, y + 5, { align: 'right' });
      doc.text('VOLUMEN ACTUAL', 130, y + 5, { align: 'right' });
      doc.text('% LLENADO', 160, y + 5, { align: 'right' });
      doc.text('ESTADO', 190, y + 5, { align: 'right' });
      y += 8.5;

      let totalCap = 0;
      let totalStock = 0;

      doc.setFont('helvetica', 'normal');
      tanques.forEach((t) => {
        const cap = Number(t.capacidad_maxima || 0);
        const stock = Number(t.volumen_actual || 0);
        const porc = cap > 0 ? Math.min(100, Math.round((stock / cap) * 100)) : 0;
        totalCap += cap;
        totalStock += stock;

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 5, 196, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(t.codigo_tanque || '-', 18, y + 3.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(t.producto || '-', 45, y + 3.5);

        doc.text(`${cap.toLocaleString('es-ES')} L`, 90, y + 3.5, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`${stock.toLocaleString('es-ES')} L`, 130, y + 3.5, { align: 'right' });

        doc.text(`${porc}%`, 160, y + 3.5, { align: 'right' });

        if (porc < 30) {
          doc.setTextColor(220, 38, 38);
          doc.text('Nivel Bajo', 190, y + 3.5, { align: 'right' });
        } else {
          doc.setTextColor(16, 185, 129);
          doc.text('Seguro', 190, y + 3.5, { align: 'right' });
        }

        y += 7;
      });

      // Fila total tanques
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('TOTAL ESTACIÓN', 18, y + 5);
      doc.text(`${totalCap.toLocaleString('es-ES')} L`, 90, y + 5, { align: 'right' });
      doc.text(`${totalStock.toLocaleString('es-ES')} L`, 130, y + 5, { align: 'right' });
      const porcGlobal = totalCap > 0 ? Math.round((totalStock / totalCap) * 100) : 0;
      doc.text(`${porcGlobal}%`, 160, y + 5, { align: 'right' });
      y += 15;

      // 5. SECCIÓN 3: RESUMEN DE VENTAS DE HOY
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('3. Ventas y Recaudación del Día', 14, y);
      y += 5;

      const cardW = 58;
      // Card 1
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, y, cardW, 19, 2, 2, 'FD');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL RECAUDADO HOY', 18, y + 6);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`$${totalMontoHoy.toFixed(2)}`, 18, y + 14);

      // Card 2
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14 + cardW + 4, y, cardW, 19, 2, 2, 'FD');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('LITROS DESPACHADOS', 18 + cardW + 4, y + 6);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(`${totalLitrosHoy.toFixed(2)} L`, 18 + cardW + 4, y + 14);

      // Card 3
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14 + (cardW + 4) * 2, y, cardW, 19, 2, 2, 'FD');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DE TRANSACCIONES', 18 + (cardW + 4) * 2, y + 6);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${ventas.length} despachos`, 18 + (cardW + 4) * 2, y + 14);

      y += 25;

      // 6. DESGLOSE DE MEDIOS DE PAGO
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text('Desglose de Formas de Pago Recibidas:', 14, y);
      y += 4;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, y, 182, 17, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);

      doc.text('Efectivo en caja:', 18, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`$${efectivo.toFixed(2)}`, 50, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Tarjeta / Punto de Venta:', 100, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`$${tarjeta.toFixed(2)}`, 145, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Pago Móvil:', 18, y + 12.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`$${pagoMovil.toFixed(2)}`, 50, y + 12.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Vales Corporativos (Flota):', 100, y + 12.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`$${vales.toFixed(2)}`, 145, y + 12.5);

      // 7. PIE DE PÁGINA
      doc.setDrawColor(203, 213, 225);
      doc.line(14, 280, 196, 280);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Documento oficial generado por Cross-Station ERP - Sistema de Gestión Operativa', 14, 285);
      doc.text('Página 1 de 1', 196, 285, { align: 'right' });

      // Descargar PDF
      const fechaArchivo = new Date().toISOString().slice(0, 10);
      doc.save(`Reporte_CrossStation_${fechaArchivo}.pdf`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('No se pudo generar el reporte en PDF: ' + err.message);
    } finally {
      setGenerandoPDF(false);
    }
  };

  const fetchTanques = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('tanques')
        .select('*')
        .order('id', { ascending: true });

      if (fetchError) throw fetchError;
      setTanques(data || []);
      setError(null);
    } catch (err) {
      console.error('Error cargando tanques:', err);
      setError(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrecios = async () => {
    try {
      const { data } = await supabase.from('precios_combustible').select('*');
      if (data && data.length > 0) {
        const gas = data.find((p) => p.producto === 'Gasolina');
        const die = data.find((p) => p.producto === 'Diesel');
        if (gas) setPrecioGasolina(Number(gas.precio_litro).toFixed(2));
        if (die) setPrecioDiesel(Number(die.precio_litro).toFixed(2));
      }
    } catch (e) {
      console.warn('Aviso precios:', e.message);
    }
  };

  const handleGuardarPrecios = async (e) => {
    e.preventDefault();
    setGuardandoPrecios(true);
    setMensajePrecios(null);
    try {
      const gVal = parseFloat(precioGasolina);
      const dVal = parseFloat(precioDiesel);

      if (isNaN(gVal) || gVal <= 0 || isNaN(dVal) || dVal <= 0) {
        throw new Error('Escribe precios válidos mayores a 0.');
      }

      const { error: upsertErr } = await supabase
        .from('precios_combustible')
        .upsert([
          { producto: 'Gasolina', precio_litro: gVal, actualizado_en: new Date().toISOString() },
          { producto: 'Diesel', precio_litro: dVal, actualizado_en: new Date().toISOString() }
        ]);

      if (upsertErr) throw upsertErr;

      setMensajePrecios({ tipo: 'exito', texto: '¡Precios actualizados con éxito en toda la estación!' });
      setTimeout(() => setMensajePrecios(null), 4000);
    } catch (err) {
      console.error('Error guardando precios:', err);
      setMensajePrecios({ tipo: 'error', texto: err.message || 'No se pudieron guardar los precios.' });
    } finally {
      setGuardandoPrecios(false);
    }
  };

  useEffect(() => {
    fetchTanques();
    fetchPrecios();

    const channel = supabase
      .channel('tanques_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tanques' },
        () => {
          fetchTanques();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Proyección TOTAL analizando todos los tanques juntos
  const handleProyectarTotal = async () => {
    if (tanques.length === 0) {
      setErrorIA('No hay tanques disponibles para analizar.');
      return;
    }

    setIsLoadingIA(true);
    setErrorIA(null);

    try {
      const payloadTotal = {
        tanques: tanques.map((t) => ({
          id: t.id,
          codigo_tanque: t.codigo_tanque,
          producto: t.producto,
          capacidad_maxima: Number(t.capacidad_maxima),
          volumen_actual: Number(t.volumen_actual),
          ventas_promedio: 2500
        }))
      };

      const response = await fetch('/api/proyeccion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadTotal)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo obtener la proyección general');
      }

      setProyeccionTotal(data.proyeccion || data);
    } catch (err) {
      console.error('Error en proyección total:', err);
      setErrorIA(err.message || 'Error al conectar con el servicio de proyección');
    } finally {
      setIsLoadingIA(false);
    }
  };

  const getBarColor = (producto, nivel) => {
    if (nivel <= 20) return 'bg-red-500';
    if (nivel <= 50) return 'bg-yellow-500';
    return producto?.toLowerCase() === 'diesel' ? 'bg-blue-500' : 'bg-green-500';
  };

  const handleCerrarSesion = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 text-2xl font-bold border-b border-slate-700">
          Cross-<span className="text-blue-400">Station</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            type="button"
            onClick={() => setVistaActiva('dashboard')}
            className={`w-full text-left block p-3 rounded transition-colors cursor-pointer ${
              vistaActiva === 'dashboard'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Nivel de Tanques
          </button>
          <button
            type="button"
            onClick={() => setVistaActiva('ventas')}
            className={`w-full text-left block p-3 rounded transition-colors cursor-pointer ${
              vistaActiva === 'ventas'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Ventas de Hoy
          </button>
          <button
            type="button"
            onClick={() => setVistaActiva('auditoria')}
            className={`w-full text-left block p-3 rounded transition-colors cursor-pointer ${
              vistaActiva === 'auditoria'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Control de Fugas y Medidas
          </button>
          <button
            type="button"
            onClick={() => setVistaActiva('operadores')}
            className={`w-full text-left block p-3 rounded transition-colors cursor-pointer ${
              vistaActiva === 'operadores'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Equipo de Operadores
          </button>
        </nav>

        {/* Botón Cerrar Sesión al final de la sidebar */}
        <div className="p-4 border-t border-slate-700">
          <button
            type="button"
            onClick={handleCerrarSesion}
            className="w-full text-left flex items-center gap-3 p-3 rounded text-red-400 hover:bg-slate-800 transition-colors cursor-pointer text-sm font-medium"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
              />
            </svg>
            <span>Salir</span>
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 p-8">
        {vistaActiva === 'dashboard' && (
          <>
            <header className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Nivel de Combustible en Tanques</h1>
                <p className="text-sm text-gray-500 mt-1">Revisa cuánta gasolina queda y cuándo pedir camión</p>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={handleProyectarTotal}
                  disabled={isLoadingIA || tanques.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded shadow-sm font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isLoadingIA ? 'Consultando IA...' : '¿Cuánto hay que pedir? (IA)'}
                </button>

                <button
                  onClick={fetchTanques}
                  className="bg-slate-800 text-white px-4 py-2 rounded shadow-sm hover:bg-slate-700 disabled:opacity-50 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                  disabled={loading}
                >
                  {loading ? 'Actualizando...' : 'Actualizar'}
                </button>
                <button
                  type="button"
                  onClick={handleDescargarReportePDF}
                  disabled={generandoPDF || loading}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontWeight: '600',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: generandoPDF ? 'not-allowed' : 'pointer',
                    opacity: generandoPDF ? 0.7 : 1
                  }}
                  className="hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <svg style={{ width: '15px', height: '15px', color: '#dc2626' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 2l3 3h-3V4zM5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm0 3a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm0 3a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{generandoPDF ? 'Generando PDF...' : 'Descargar Reporte (PDF)'}</span>
                </button>
              </div>
            </header>

            {/* Panel de Configuración de Precios Oficiales */}
            <div className="mb-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Precios Oficiales de Venta ($/Litro)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define el precio por litro de Gasolina y Diesel para el cobro automático a los clientes
                  </p>
                </div>
                <form onSubmit={handleGuardarPrecios} className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-xs font-bold text-emerald-800">Gasolina:</span>
                    <span className="text-xs text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={precioGasolina}
                      onChange={(e) => setPrecioGasolina(e.target.value)}
                      className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-xs font-bold text-blue-800">Diesel:</span>
                    <span className="text-xs text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={precioDiesel}
                      onChange={(e) => setPrecioDiesel(e.target.value)}
                      className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={guardandoPrecios}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: '700',
                      padding: '7px 16px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}
                    className="hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {guardandoPrecios ? 'Guardando...' : 'Guardar Precios'}
                  </button>
                </form>
              </div>

              {mensajePrecios && (
                <div
                  className={`mt-3 p-2.5 rounded text-xs font-medium ${
                    mensajePrecios.tipo === 'exito'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {mensajePrecios.texto}
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 mb-6 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm">
                No se pudo cargar la información: {error}
              </div>
            )}

            {errorIA && (
              <div className="p-4 mb-6 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm flex justify-between items-center">
                <span><strong>Aviso:</strong> {errorIA}</span>
                <button onClick={() => setErrorIA(null)} className="font-bold underline ml-4 text-red-700 cursor-pointer">Descartar</button>
              </div>
            )}

            {/* TARJETA DE PROYECCIÓN TOTAL DE LA ESTACIÓN */}
            {proyeccionTotal && (
              <div className="mb-8 bg-white border border-blue-200 rounded-xl p-6 shadow-md transition-all">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4 mb-5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wide ${
                        proyeccionTotal.requiere_ninguno
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : proyeccionTotal.requieren_todos
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {proyeccionTotal.requiere_ninguno
                        ? 'Tanques con buen nivel'
                        : proyeccionTotal.requieren_todos
                        ? 'Pedir camión urgente'
                        : 'Pedir para algunos tanques'}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">
                        Consejo para pedir combustible ({tanques.length} Tanques)
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Cálculo automático según el consumo diario de tu estación
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setProyeccionTotal(null)}
                    className="text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded transition-colors font-medium border border-gray-200 cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                {/* Banner con recomendación general clara */}
                <div
                  className={`p-4 rounded-lg mb-6 border text-sm leading-relaxed ${
                    proyeccionTotal.requiere_ninguno
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                      : proyeccionTotal.requieren_todos
                      ? 'bg-red-50 border-red-200 text-red-700 font-medium'
                      : 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                  }`}
                >
                  <strong>Consejo: </strong>
                  {proyeccionTotal.resumen}
                </div>

                {/* Estado de cada tanque analizado */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {proyeccionTotal.tanques &&
                    proyeccionTotal.tanques.map((t) => (
                      <div
                        key={t.id}
                        className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-gray-800 text-base">{t.codigo_tanque}</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                              {t.producto}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">
                            {Number(t.volumen_actual).toLocaleString('es-ES')} / {Number(t.capacidad_maxima).toLocaleString('es-ES')} L ({t.porcentaje}%)
                          </p>
                          <div className="text-xs text-gray-500 mb-3">
                            Alcanza para: <strong>{t.dias_autonomia} días</strong>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 text-xs">
                          {t.volumen_sugerido_litros > 0 ? (
                            <span className="font-bold text-blue-600">
                              Pedir cisterna de: {Number(t.volumen_sugerido_litros).toLocaleString('es-ES')} L
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-700">
                              Tiene suficiente por hoy
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Visualización de Tanques de Pista */}
            {loading && tanques.length === 0 ? (
              <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
                Cargando tanques...
              </div>
            ) : tanques.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No hay tanques registrados</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Aún no se han configurado tanques en el sistema.
                </p>
                <button
                  onClick={fetchTanques}
                  className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {tanques.map((tanque) => {
                  const capMax = Number(tanque.capacidad_maxima) || 1;
                  const volAct = Number(tanque.volumen_actual) || 0;
                  const nivel = Math.min(100, Math.max(0, Math.round((volAct / capMax) * 100)));
                  const colorClass = getBarColor(tanque.producto, nivel);

                  return (
                    <div key={tanque.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="text-lg font-semibold text-gray-700">{tanque.codigo_tanque}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          {tanque.producto}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-4">
                        {volAct.toLocaleString('es-ES')} / {capMax.toLocaleString('es-ES')} L
                      </p>
                      
                      <div className="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
                        <div 
                          className={`${colorClass} h-4 rounded-full transition-all duration-500`} 
                          style={{ width: `${nivel}%` }}
                        ></div>
                      </div>
                      <p className="text-right text-sm font-medium text-gray-700">{nivel}% lleno</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Módulo de Recepción de Cisternas */}
            <RecepcionCisternas tanquesActuales={tanques} onRecargaExitosa={fetchTanques} />
          </>
        )}

        {vistaActiva === 'ventas' && (
          <div className="space-y-6">
            <header className="mb-6">
              <h1 className="text-3xl font-bold text-gray-800">Ventas de Hoy</h1>
              <p className="text-sm text-gray-500 mt-1">Lista de las ventas realizadas hoy y cómo pagaron los clientes</p>
            </header>
            <VentasDiarias />
          </div>
        )}

        {vistaActiva === 'auditoria' && (
          <div className="space-y-6">
            <header className="mb-6">
              <h1 className="text-3xl font-bold text-gray-800">Control de Fugas y Medidas con Vara</h1>
              <p className="text-sm text-gray-500 mt-1">Compara la medida de la vara con lo que dice el sistema para detectar pérdidas</p>
            </header>
            <AuditoriaFugas tanquesActuales={tanques} />
          </div>
        )}

        {vistaActiva === 'operadores' && (
          <div className="space-y-6">
            <header className="mb-6">
              <h1 className="text-3xl font-bold text-gray-800">Equipo de Operadores</h1>
              <p className="text-sm text-gray-500 mt-1">Aprueba operadores y revisa cuánto dinero ha cobrado cada uno</p>
            </header>
            <GestionOperadores tanquesActuales={tanques} />
          </div>
        )}
      </main>
    </div>
  );
}
