'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function VentasDiarias() {
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const fetchVentas = async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('ventas')
        .select(`
          id, 
          litros_vendidos, 
          monto_cobrado, 
          metodo_pago, 
          fecha_registro,
          tanques(codigo_tanque)
        `)
        .order('fecha_registro', { ascending: false })
        .limit(10);

      if (queryError) {
        // Fallback con consulta directa si la relación anidada falla
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('ventas')
          .select('*')
          .order('fecha_registro', { ascending: false })
          .limit(10);

        if (fallbackError) throw fallbackError;
        setVentas(fallbackData || []);
      } else {
        setVentas(data || []);
      }
    } catch (err) {
      console.error('Error consultando ventas:', err);
      setError(err.message || 'Error al cargar transacciones');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    fetchVentas();

    const channel = supabase
      .channel('ventas_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventas' },
        () => {
          fetchVentas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const descargarCSV = () => {
    if (!ventas || ventas.length === 0) return;

    const encabezados = ['ID', 'Fecha_Registro', 'Tanque', 'Litros_Vendidos', 'Monto_Cobrado_USD', 'Metodo_Pago'];
    const filas = ventas.map((v) => [
      v.id,
      new Date(v.fecha_registro).toLocaleString('es-ES'),
      v.tanques?.codigo_tanque || `Tanque ${v.tanque_id || 'N/A'}`,
      v.litros_vendidos,
      v.monto_cobrado || (Number(v.litros_vendidos) * 0.5).toFixed(2),
      `"${v.metodo_pago || 'Efectivo'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ventas_diarias_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ventas y Cobros de Hoy</h2>
          <p className="text-xs text-slate-500 mt-1">Lista de las ventas realizadas hoy y forma de pago de cada cliente</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={fetchVentas}
            disabled={cargando}
            className="border border-slate-300 bg-white text-slate-700 px-3 py-2 rounded shadow-sm hover:bg-slate-50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button
            type="button"
            onClick={descargarCSV}
            disabled={ventas.length === 0}
            className="bg-slate-100 text-slate-600 px-4 py-2 rounded shadow-sm hover:bg-slate-200 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
          >
            Descargar en Excel (CSV)
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
          Aviso: {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs tracking-wider">
            <tr>
              <th className="p-4 rounded-tl-lg">Hora</th>
              <th className="p-4">Tanque / Combustible</th>
              <th className="p-4 text-right">Litros</th>
              <th className="p-4 text-right">Total cobrado ($)</th>
              <th className="p-4 rounded-tr-lg">Forma de pago</th>
            </tr>
          </thead>
          <tbody>
            {cargando && ventas.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-500">
                  Cargando ventas...
                </td>
              </tr>
            ) : ventas.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-500">
                  Aún no se han registrado ventas hoy.
                </td>
              </tr>
            ) : (
              ventas.map((venta) => {
                const volumen = Number(venta.litros_vendidos || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 });
                const monto = Number(venta.monto_cobrado || Number(venta.litros_vendidos || 0) * 0.5).toLocaleString('es-ES', { minimumFractionDigits: 2 });
                const nombreTanque = venta.tanques?.codigo_tanque || (venta.tanque_id ? `Tanque ${venta.tanque_id}` : 'General');

                return (
                  <tr key={venta.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono text-xs text-slate-600">
                      {new Date(venta.fecha_registro).toLocaleString('es-ES')}
                    </td>
                    <td className="p-4 font-medium text-slate-800">
                      {nombreTanque}
                    </td>
                    <td className="p-4 text-right text-blue-600 font-bold">
                      {volumen} L
                    </td>
                    <td className="p-4 text-right text-green-600 font-bold">
                      ${monto}
                    </td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded text-xs font-semibold border border-slate-200">
                        {venta.metodo_pago || 'Efectivo'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
