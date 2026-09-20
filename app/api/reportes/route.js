import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Ruta de respaldo local para configuración persistente
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'docs', 'reportes_config.json');

function leerConfigLocal() {
  try {
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Error leyendo respaldo local:', e);
  }
  return null;
}

function guardarConfigLocal(cfg) {
  try {
    fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error guardando respaldo local:', e);
  }
}

// Cliente Supabase del servidor
function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Validar autorización (secret o usuario autenticado)
async function verificarAutorizacion(request) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  // 1. Clave secreta fija
  if (
    secret === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`
  ) {
    return true;
  }

  // 2. Token de sesión Supabase del gerente
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const supabase = getServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return true;
    }
  }

  return false;
}

// Obtener configuración activa de reportes (combina Supabase y Respaldo)
async function obtenerConfiguracion(supabase) {
  const local = leerConfigLocal() || {};
  const defaults = {
    id: 1,
    hora_corte_diario: local.hora_corte_diario || '20:00',
    email_destinatario: local.email_destinatario || process.env.EMAIL_USER || 'cross.station11@gmail.com',
    activo: typeof local.activo === 'boolean' ? local.activo : true,
    ultimo_envio: local.ultimo_envio || null
  };

  try {
    const { data, error } = await supabase
      .from('configuracion_reportes')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id || 1,
        hora_corte_diario: data.hora_corte_diario ? data.hora_corte_diario.slice(0, 5) : defaults.hora_corte_diario,
        email_destinatario: data.email_destinatario || defaults.email_destinatario,
        activo: typeof data.activo === 'boolean' ? data.activo : defaults.activo,
        ultimo_envio: data.ultimo_envio || defaults.ultimo_envio
      };
    }
  } catch (err) {
    console.warn('Aviso: Usando respaldo local de configuración:', err.message);
  }

  return defaults;
}

// Generar y enviar el correo con los datos reales del día y de la semana
async function ejecutarEnvioReporte(supabase, configOverride = {}) {
  const config = await obtenerConfiguracion(supabase);
  const destinatario = configOverride.email_destinatario || config.email_destinatario || process.env.EMAIL_USER;

  // 1. Manejo de rangos de fecha (Zona horaria de estación Venezuela / UTC-4 con fallback)
  const ahora = new Date();
  let fechaLocalStr = ahora.toISOString().split('T')[0];
  try {
    fechaLocalStr = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  } catch (e) {}

  const inicioDia = new Date(`${fechaLocalStr}T00:00:00-04:00`);
  const inicioDiaIso = isNaN(inicioDia.getTime()) ? `${fechaLocalStr}T00:00:00Z` : inicioDia.toISOString();

  // Calcular inicio de semana (Lunes a las 00:00:00 de la semana en curso)
  const fechaSemana = isNaN(inicioDia.getTime()) ? new Date(ahora) : new Date(inicioDia);
  const dayOfWeek = fechaSemana.getDay(); // 0: Dom, 1: Lun, 2: Mar...
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  fechaSemana.setDate(fechaSemana.getDate() + diffToMonday);
  fechaSemana.setHours(0, 0, 0, 0);
  const inicioSemanaIso = fechaSemana.toISOString();
  const fechaSemanaStr = fechaSemana.toISOString().split('T')[0];

  // 2. Consultar lista completa de tanques físicos
  const { data: tanquesData, error: tanquesError } = await supabase
    .from('tanques')
    .select('id, codigo_tanque, producto, capacidad_maxima, volumen_actual')
    .order('id', { ascending: true });

  if (tanquesError) {
    console.warn('Advertencia al consultar tanques:', tanquesError.message);
  }
  const listaTanques = tanquesData || [];

  // 3. Consultar ventas de la semana en curso (incluye las de hoy)
  const { data: ventasData, error: ventasError } = await supabase
    .from('ventas')
    .select('id, litros_vendidos, monto_cobrado, metodo_pago, fecha_registro, tanque_id, tanques(id, codigo_tanque, producto)')
    .gte('fecha_registro', inicioSemanaIso)
    .order('fecha_registro', { ascending: false });

  if (ventasError) {
    throw new Error(`Error consultando ventas en BD: ${ventasError.message}`);
  }
  const ventasSemana = ventasData || [];
  const ventasHoy = ventasSemana.filter(v => v.fecha_registro && v.fecha_registro >= inicioDiaIso);

  // 4. Consultar recargas de cisterna (recepciones_combustible)
  let recargasSemana = [];
  try {
    const { data: recargasData, error: recargasError } = await supabase
      .from('recepciones_combustible')
      .select('id, tanque_id, volumen_recibido, nro_guia_despacho, fecha_recepcion, tanques(id, codigo_tanque, producto)')
      .gte('fecha_recepcion', inicioSemanaIso)
      .order('fecha_recepcion', { ascending: false });

    if (!recargasError && recargasData) {
      recargasSemana = recargasData;
    }
  } catch (err) {
    console.warn('Tabla recepciones_combustible no accesible:', err.message);
  }
  const recargasHoy = recargasSemana.filter(r => r.fecha_recepcion && r.fecha_recepcion >= inicioDiaIso);

  // 5. Cálculos para el DÍA DE HOY
  const ingresosHoy = ventasHoy.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const litrosHoy = ventasHoy.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
  const recargasLitrosHoy = recargasHoy.reduce((acc, r) => acc + Number(r.volumen_recibido || 0), 0);

  // Desglose por combustible (Hoy)
  const combustibleHoy = {
    Gasolina: { litros: 0, monto: 0, transacciones: 0 },
    Diesel: { litros: 0, monto: 0, transacciones: 0 }
  };
  ventasHoy.forEach(v => {
    const tipo = v.tanques?.producto || (v.tanque_id <= 2 ? 'Gasolina' : 'Diesel');
    if (!combustibleHoy[tipo]) combustibleHoy[tipo] = { litros: 0, monto: 0, transacciones: 0 };
    combustibleHoy[tipo].litros += Number(v.litros_vendidos || 0);
    combustibleHoy[tipo].monto += Number(v.monto_cobrado || 0);
    combustibleHoy[tipo].transacciones += 1;
  });

  // Desglose por tanque (Hoy)
  const tanquesHoyDetalle = listaTanques.map(t => {
    const ventasT = ventasHoy.filter(v => v.tanque_id === t.id);
    const recargasT = recargasHoy.filter(r => r.tanque_id === t.id);
    const litrosVendidos = ventasT.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
    const montoCobrado = ventasT.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
    const litrosRecargados = recargasT.reduce((acc, r) => acc + Number(r.volumen_recibido || 0), 0);
    return {
      ...t,
      litros_vendidos: litrosVendidos,
      monto_cobrado: montoCobrado,
      litros_recargados: litrosRecargados,
      recargas_count: recargasT.length
    };
  });

  // Desglose métodos de pago (Hoy)
  const metodosHoy = ventasHoy.reduce((acc, v) => {
    const m = v.metodo_pago || 'Otro';
    acc[m] = (acc[m] || 0) + Number(v.monto_cobrado || 0);
    return acc;
  }, {});

  // 6. Cálculos ACUMULADOS DE LA SEMANA
  const ingresosSemana = ventasSemana.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const litrosSemana = ventasSemana.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
  const recargasLitrosSemana = recargasSemana.reduce((acc, r) => acc + Number(r.volumen_recibido || 0), 0);

  // Desglose por combustible (Semana)
  const combustibleSemana = {
    Gasolina: { litros: 0, monto: 0, transacciones: 0 },
    Diesel: { litros: 0, monto: 0, transacciones: 0 }
  };
  ventasSemana.forEach(v => {
    const tipo = v.tanques?.producto || (v.tanque_id <= 2 ? 'Gasolina' : 'Diesel');
    if (!combustibleSemana[tipo]) combustibleSemana[tipo] = { litros: 0, monto: 0, transacciones: 0 };
    combustibleSemana[tipo].litros += Number(v.litros_vendidos || 0);
    combustibleSemana[tipo].monto += Number(v.monto_cobrado || 0);
    combustibleSemana[tipo].transacciones += 1;
  });

  // Desglose por tanque (Semana)
  const tanquesSemanaDetalle = listaTanques.map(t => {
    const ventasT = ventasSemana.filter(v => v.tanque_id === t.id);
    const recargasT = recargasSemana.filter(r => r.tanque_id === t.id);
    return {
      ...t,
      litros_vendidos: ventasT.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0),
      monto_cobrado: ventasT.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0),
      litros_recargados: recargasT.reduce((acc, r) => acc + Number(r.volumen_recibido || 0), 0),
      recargas_count: recargasT.length
    };
  });

  // 7. Configurar Nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const fechaFormateada = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Formateadores HTML
  const formatMonto = (n) => `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatLitros = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;

  // Filas Tanques Hoy HTML
  const filasTanquesHoyHtml = tanquesHoyDetalle.map(t => {
    const pct = t.capacidad_maxima > 0 ? ((t.volumen_actual / t.capacidad_maxima) * 100).toFixed(1) : 0;
    const esGas = t.producto?.toLowerCase().includes('gasolina');
    const badgeColor = esGas ? '#0284c7' : '#d97706';
    return `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">${t.codigo_tanque}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
          <span style="background: ${badgeColor}15; color: ${badgeColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${t.producto}</span>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #1e293b;">${formatLitros(t.litros_vendidos)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d;">${formatMonto(t.monto_cobrado)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569; font-size: 13px;">
          ${Number(t.volumen_actual || 0).toLocaleString('es-ES')} L <span style="font-size: 11px; color: #64748b;">(${pct}%)</span>
        </td>
      </tr>
    `;
  }).join('');

  // Filas Recargas Hoy HTML
  const filasRecargasHoyHtml = recargasHoy.length > 0
    ? recargasHoy.map(r => {
        const codTanque = r.tanques?.codigo_tanque || `Tanque #${r.tanque_id}`;
        const prod = r.tanques?.producto || '';
        const horaStr = r.fecha_recepcion ? new Date(r.fecha_recepcion).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '-';
        return `
          <tr>
            <td style="padding: 9px 12px; border-bottom: 1px solid #fed7aa; color: #7c2d12; font-weight: 600;">${codTanque} <span style="font-size: 11px; font-weight: normal; color: #9a3412;">(${prod})</span></td>
            <td style="padding: 9px 12px; border-bottom: 1px solid #fed7aa; text-align: right; font-weight: bold; color: #c2410c;">+${formatLitros(r.volumen_recibido)}</td>
            <td style="padding: 9px 12px; border-bottom: 1px solid #fed7aa; text-align: center; color: #431407; font-family: monospace;">${r.nro_guia_despacho || 'S/N'}</td>
            <td style="padding: 9px 12px; border-bottom: 1px solid #fed7aa; text-align: right; color: #7c2d12;">${horaStr}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="4" style="padding: 14px; text-align: center; color: #64748b; font-style: italic; background: #fafafa;">Sin recargas de cisterna registradas durante el día de hoy</td></tr>`;

  // Filas Desglose Semanal por Tanque HTML
  const filasTanquesSemanaHtml = tanquesSemanaDetalle.map(t => {
    const esGas = t.producto?.toLowerCase().includes('gasolina');
    const badgeColor = esGas ? '#0284c7' : '#d97706';
    return `
      <tr>
        <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">${t.codigo_tanque}</td>
        <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0;">
          <span style="background: ${badgeColor}15; color: ${badgeColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${t.producto}</span>
        </td>
        <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #1e293b;">${formatLitros(t.litros_vendidos)}</td>
        <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d;">${formatMonto(t.monto_cobrado)}</td>
        <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #c2410c; font-weight: 600;">
          ${t.litros_recargados > 0 ? `+${formatLitros(t.litros_recargados)}` : '<span style="color: #94a3b8;">0 L</span>'}
        </td>
      </tr>
    `;
  }).join('');

  // Filas Métodos de Pago HTML
  const desgloseMetodosHtml = Object.entries(metodosHoy).map(([metodo, monto]) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">${metodo}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">${formatMonto(monto)}</td>
    </tr>
  `).join('');

  // 8. Texto Plano para clientes de correo sin HTML
  const plainText = `
==============================================
   CROSS-STATION ERP | REPORTE DIARIO Y SEMANAL
==============================================
Fecha: ${fechaFormateada}
Destinatario: ${destinatario}

--- BALANCE DEL DÍA (${fechaLocalStr}) ---
• Ingresos Totales Hoy: ${formatMonto(ingresosHoy)}
• Litros Totales Vendidos Hoy: ${formatLitros(litrosHoy)}
• Despachos Realizados Hoy: ${ventasHoy.length}
• Recargas Recibidas Hoy: ${formatLitros(recargasLitrosHoy)} (${recargasHoy.length} cisterna(s))

- Ventas por Combustible Hoy:
  * Gasolina: ${formatLitros(combustibleHoy.Gasolina?.litros)} | ${formatMonto(combustibleHoy.Gasolina?.monto)}
  * Diesel:   ${formatLitros(combustibleHoy.Diesel?.litros)} | ${formatMonto(combustibleHoy.Diesel?.monto)}

- Detalle por Tanque Hoy:
${tanquesHoyDetalle.map(t => `  * ${t.codigo_tanque} (${t.producto}): ${formatLitros(t.litros_vendidos)} vendidos (${formatMonto(t.monto_cobrado)}) | Stock: ${t.volumen_actual}L`).join('\n')}

- Recargas de Cisterna Hoy:
${recargasHoy.length > 0 ? recargasHoy.map(r => `  * ${r.tanques?.codigo_tanque || `Tanque ${r.tanque_id}`}: +${formatLitros(r.volumen_recibido)} | Guía: ${r.nro_guia_despacho || 'S/N'}`).join('\n') : '  * Sin recargas registradas hoy.'}

--- TOTAL ACUMULADO DE LA SEMANA (Desde ${fechaSemanaStr}) ---
• Ingresos Totales Semana: ${formatMonto(ingresosSemana)}
• Litros Totales Semana:   ${formatLitros(litrosSemana)}
• Total Recargado Semana:  ${formatLitros(recargasLitrosSemana)} (${recargasSemana.length} descarga(s))
• Gasolina Semanal: ${formatLitros(combustibleSemana.Gasolina?.litros)} | ${formatMonto(combustibleSemana.Gasolina?.monto)}
• Diesel Semanal:   ${formatLitros(combustibleSemana.Diesel?.litros)} | ${formatMonto(combustibleSemana.Diesel?.monto)}

---\nGenerado automáticamente por el motor de corte Cross-Station ERP.
`.trim();

  // 9. Ensamblar y despachar el correo
  await transporter.sendMail({
    from: `"Cross-Station ERP" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: `Reporte Diario & Balance Semanal (${fechaLocalStr}) | Cross-Station`,
    text: plainText,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 660px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; color: #1e293b;">
        
        <!-- ENCABEZADO -->
        <div style="background: #0f172a; padding: 26px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; font-weight: 800;">CROSS-<span style="color: #38bdf8;">STATION</span></h1>
          <p style="color: #94a3b8; margin: 6px 0 0; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">Informe Oficial de Operaciones Diarias y Auditoría Semanal</p>
          <div style="margin-top: 10px; display: inline-block; background: #1e293b; color: #cbd5e1; font-size: 12px; padding: 4px 12px; border-radius: 20px;">
            📅 ${fechaFormateada}
          </div>
        </div>

        <div style="padding: 24px;">

          <!-- SECCIÓN 1: BALANCE GENERAL DEL DÍA -->
          <div style="margin-bottom: 24px;">
            <div style="border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 14px;">
              <h2 style="font-size: 16px; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">
                1. Balance del Día (${fechaLocalStr})
              </h2>
            </div>

            <!-- KPI CARDS HOY -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">Ingresos Hoy</span>
                <div style="font-size: 22px; font-weight: 800; color: #15803d; margin-top: 4px;">${formatMonto(ingresosHoy)}</div>
                <div style="font-size: 11px; color: #166534; margin-top: 2px;">${ventasHoy.length} ventas</div>
              </div>

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase;">Volumen Hoy</span>
                <div style="font-size: 22px; font-weight: 800; color: #2563eb; margin-top: 4px;">${formatLitros(litrosHoy)}</div>
                <div style="font-size: 11px; color: #1e40af; margin-top: 2px;">despachados</div>
              </div>

              <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 14px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #9a3412; text-transform: uppercase;">Recargas Hoy</span>
                <div style="font-size: 22px; font-weight: 800; color: #c2410c; margin-top: 4px;">+${formatLitros(recargasLitrosHoy)}</div>
                <div style="font-size: 11px; color: #9a3412; margin-top: 2px;">${recargasHoy.length} cisterna(s)</div>
              </div>
            </div>

            <!-- TARJETAS RESUMEN COMBUSTIBLE HOY -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="border: 1px solid #e0f2fe; background: #f0f9ff; border-radius: 8px; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #0369a1; font-size: 14px;">⛽ Gasolina (Hoy)</strong>
                  <span style="font-size: 12px; color: #0284c7; font-weight: bold;">${combustibleHoy.Gasolina?.transacciones || 0} despachos</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 13px;">
                  <span style="color: #475569;">Litros: <strong>${formatLitros(combustibleHoy.Gasolina?.litros)}</strong></span>
                  <span style="color: #15803d; font-weight: bold;">${formatMonto(combustibleHoy.Gasolina?.monto)}</span>
                </div>
              </div>

              <div style="border: 1px solid #fef3c7; background: #fffbeb; border-radius: 8px; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #b45309; font-size: 14px;">🚛 Diesel (Hoy)</strong>
                  <span style="font-size: 12px; color: #d97706; font-weight: bold;">${combustibleHoy.Diesel?.transacciones || 0} despachos</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 13px;">
                  <span style="color: #475569;">Litros: <strong>${formatLitros(combustibleHoy.Diesel?.litros)}</strong></span>
                  <span style="color: #15803d; font-weight: bold;">${formatMonto(combustibleHoy.Diesel?.monto)}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- SECCIÓN 2: VENTAS POR TANQUES FÍSICOS HOY -->
          <div style="margin-bottom: 24px;">
            <div style="border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 10px;">
              <h3 style="font-size: 14px; color: #334155; margin: 0; text-transform: uppercase; font-weight: 700;">
                2. Litros Vendidos por Tanque (Hoy)
              </h3>
            </div>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #f8fafc; color: #64748b; text-transform: uppercase; font-size: 11px;">
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Tanque</th>
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Producto</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">Despacho Hoy</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">Ingresos Hoy</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">Stock Actual</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasTanquesHoyHtml || '<tr><td colspan="5" style="padding: 12px; text-align: center; color: #94a3b8;">No se registraron ventas en los tanques</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- SECCIÓN 3: RECARGAS DE CISTERNA DEL DÍA -->
          <div style="margin-bottom: 26px;">
            <div style="border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 10px;">
              <h3 style="font-size: 14px; color: #c2410c; margin: 0; text-transform: uppercase; font-weight: 700;">
                3. Recargas y Recepción de Cisternas (Hoy)
              </h3>
            </div>
            <div style="border: 1px solid #fed7aa; border-radius: 8px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #fff7ed; color: #9a3412; text-transform: uppercase; font-size: 11px;">
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #fed7aa;">Tanque Destino</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #fed7aa;">Volumen Recibido</th>
                    <th style="padding: 8px 12px; text-align: center; border-bottom: 1px solid #fed7aa;">Nro. Guía</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #fed7aa;">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasRecargasHoyHtml}
                </tbody>
              </table>
            </div>
          </div>

          <!-- SECCIÓN 4: TOTAL CONSOLIDADO DE LA SEMANA -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #64748b; padding-bottom: 8px; margin-bottom: 14px;">
              <div>
                <h2 style="font-size: 15px; color: #0f172a; margin: 0; text-transform: uppercase; font-weight: 800;">
                  📊 4. Consolidado Total de la Semana
                </h2>
                <span style="font-size: 11px; color: #64748b;">Periodo en curso: desde Lunes ${fechaSemanaStr} hasta hoy</span>
              </div>
              <span style="font-size: 12px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 3px 10px; border-radius: 12px;">
                Semanal
              </span>
            </div>

            <!-- CARDS SEMANALES -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="background: #ffffff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">Total Facturado</span>
                <div style="font-size: 20px; font-weight: 800; color: #15803d; margin-top: 3px;">${formatMonto(ingresosSemana)}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${ventasSemana.length} ventas</div>
              </div>

              <div style="background: #ffffff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase;">Litros Vendidos</span>
                <div style="font-size: 20px; font-weight: 800; color: #2563eb; margin-top: 3px;">${formatLitros(litrosSemana)}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">despacho total</div>
              </div>

              <div style="background: #ffffff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: #9a3412; text-transform: uppercase;">Cisternas Recibidas</span>
                <div style="font-size: 20px; font-weight: 800; color: #c2410c; margin-top: 3px;">+${formatLitros(recargasLitrosSemana)}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${recargasSemana.length} recarga(s)</div>
              </div>
            </div>

            <!-- DESGLOSE POR COMBUSTIBLE SEMANA -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">
                Totales por Combustible (Semana):
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <span style="font-weight: 700; color: #0284c7;">⛽ Gasolina:</span>
                  <div style="font-size: 13px; color: #1e293b; margin-top: 2px;">
                    ${formatLitros(combustibleSemana.Gasolina?.litros)} | <strong style="color: #15803d;">${formatMonto(combustibleSemana.Gasolina?.monto)}</strong>
                  </div>
                </div>
                <div>
                  <span style="font-weight: 700; color: #d97706;">🚛 Diesel:</span>
                  <div style="font-size: 13px; color: #1e293b; margin-top: 2px;">
                    ${formatLitros(combustibleSemana.Diesel?.litros)} | <strong style="color: #15803d;">${formatMonto(combustibleSemana.Diesel?.monto)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- TABLA TANQUES SEMANA -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <div style="padding: 10px 12px; background: #f1f5f9; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase;">
                Resumen Semanal por Tanque y Recargas
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="color: #64748b; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #e2e8f0;">
                    <th style="padding: 7px 10px; text-align: left;">Tanque</th>
                    <th style="padding: 7px 10px; text-align: left;">Tipo</th>
                    <th style="padding: 7px 10px; text-align: right;">Litros Semana</th>
                    <th style="padding: 7px 10px; text-align: right;">Ingresos Semana</th>
                    <th style="padding: 7px 10px; text-align: right;">Recargas Semana</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasTanquesSemanaHtml}
                </tbody>
              </table>
            </div>
          </div>

          <!-- SECCIÓN 5: FORMAS DE PAGO HOY -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
            <h3 style="font-size: 13px; color: #475569; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">
              5. Medios de Pago Utilizados Hoy
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              ${desgloseMetodosHtml || '<tr><td style="padding: 8px; color: #94a3b8;">Sin transacciones monetarias registradas hoy</td></tr>'}
            </table>
          </div>

          <!-- PIE DE REPORTE -->
          <div style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
            <p style="margin: 0;">Destinatario: <strong>${destinatario}</strong> | Estado: <strong>Auditoría Completa</strong></p>
            <p style="margin: 4px 0 0;">Generado y auditado automáticamente por el motor de corte de Cross-Station ERP.</p>
          </div>

        </div>
      </div>
    `,
  });

  // 10. Actualizar fecha de último envío
  const ahoraIso = new Date().toISOString();
  guardConfigUpdate({ ultimo_envio: ahoraIso });

  try {
    await supabase
      .from('configuracion_reportes')
      .upsert({
        id: config.id || 1,
        ultimo_envio: ahoraIso,
        actualizado_en: ahoraIso
      });
  } catch (err) {
    // Si la BD no tiene la columna, se mantiene en el archivo de respaldo
  }

  return {
    exito: true,
    destinatario,
    fecha_corte: fechaLocalStr,
    hoy: {
      ingresos: ingresosHoy,
      litros_vendidos: litrosHoy,
      recargas_litros: recargasLitrosHoy,
      transacciones: ventasHoy.length,
      combustible: combustibleHoy,
      tanques: tanquesHoyDetalle
    },
    semana: {
      ingresos: ingresosSemana,
      litros_vendidos: litrosSemana,
      recargas_litros: recargasLitrosSemana,
      transacciones: ventasSemana.length,
      combustible: combustibleSemana,
      tanques: tanquesSemanaDetalle
    },
    fecha_envio: ahoraIso
  };
}

function guardConfigUpdate(partial) {
  const current = leerConfigLocal() || {};
  guardarConfigLocal({ ...current, ...partial });
}

export async function GET(request) {
  const autorizado = await verificarAutorizacion(request);
  if (!autorizado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const url = new URL(request.url);

  // Modo solo consultar configuración
  if (url.searchParams.get('config') === '1') {
    const config = await obtenerConfiguracion(supabase);
    return NextResponse.json({
      exito: true,
      config,
      hora_servidor: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    });
  }

  // Modo programador automático por cron (comprobar hora y estado)
  if (url.searchParams.get('check_time') === 'true') {
    const config = await obtenerConfiguracion(supabase);

    if (!config.activo) {
      return NextResponse.json({
        saltado: true,
        motivo: 'Envío automático desactivado por el gerente'
      });
    }

    const ahora = new Date();
    const hoyStr = ahora.toISOString().split('T')[0];

    // Verificar si ya se envió hoy
    if (config.ultimo_envio && config.ultimo_envio.startsWith(hoyStr)) {
      return NextResponse.json({
        saltado: true,
        motivo: 'El reporte de corte diario ya fue enviado hoy'
      });
    }

    // Verificar coincidencia exacta de hora para crons de 1 minuto (ventana de 2 minutos por desfase de segundos)
    const [hConf, mConf] = config.hora_corte_diario.split(':').map(Number);
    const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();
    const minutosObjetivo = hConf * 60 + mConf;
    const horaActualStr = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Si aún no es la hora o ya pasaron más de 2 minutos
    if (minutosActuales < minutosObjetivo || (minutosActuales - minutosObjetivo) > 2) {
      return NextResponse.json({
        saltado: true,
        motivo: `Aún no es la hora programada (${config.hora_corte_diario}). Hora actual servidor: ${horaActualStr}`
      });
    }
  }

  // Ejecución directa del envío
  try {
    const resultado = await ejecutarEnvioReporte(supabase);
    return NextResponse.json({
      exito: true,
      mensaje: `Reporte despachado exitosamente a ${resultado.destinatario}`,
      ...resultado
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const autorizado = await verificarAutorizacion(request);
  if (!autorizado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getServerSupabase();

  try {
    const body = await request.json();
    const { action } = body;

    // Acción 1: Guardar configuración
    if (action === 'guardar_config') {
      const { email_destinatario, hora_corte_diario, activo } = body;

      if (!email_destinatario || !email_destinatario.includes('@')) {
        return NextResponse.json({ error: 'Dirección de correo electrónico inválida' }, { status: 400 });
      }

      if (!hora_corte_diario || !/^\d{2}:\d{2}$/.test(hora_corte_diario)) {
        return NextResponse.json({ error: 'Formato de hora inválido. Use HH:MM' }, { status: 400 });
      }

      const nuevaConfig = {
        id: 1,
        email_destinatario: email_destinatario.trim(),
        hora_corte_diario,
        activo: activo !== false,
        actualizado_en: new Date().toISOString()
      };

      // Respaldo garantizado
      guardarConfigLocal(nuevaConfig);

      // Sincronización en Supabase si las columnas existen
      try {
        await supabase
          .from('configuracion_reportes')
          .upsert({
            id: 1,
            hora_corte_diario: nuevaConfig.hora_corte_diario,
            email_destinatario: nuevaConfig.email_destinatario,
            activo: nuevaConfig.activo,
            actualizado_en: nuevaConfig.actualizado_en
          });
      } catch (e) {
        console.warn('Nota: Columnas no creadas aún en Supabase, guardado en almacenamiento local.');
      }

      return NextResponse.json({
        exito: true,
        mensaje: 'Configuración de reportes actualizada correctamente',
        config: nuevaConfig
      });
    }

    // Acción 2: Enviar reporte de prueba inmediato
    if (action === 'enviar_ahora') {
      const resultado = await ejecutarEnvioReporte(supabase, {
        email_destinatario: body.email_destinatario
      });

      return NextResponse.json({
        exito: true,
        mensaje: `Reporte de prueba enviado a ${resultado.destinatario}`,
        ...resultado
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
