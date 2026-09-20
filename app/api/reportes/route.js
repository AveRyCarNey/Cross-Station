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

// Generar y enviar el correo con los datos del día
async function ejecutarEnvioReporte(supabase, configOverride = {}) {
  const config = await obtenerConfiguracion(supabase);
  const destinatario = configOverride.email_destinatario || config.email_destinatario || process.env.EMAIL_USER;

  // 1. Extraer ventas de hoy
  const hoyStr = new Date().toISOString().split('T')[0];
  const inicioDia = `${hoyStr}T00:00:00Z`;

  const { data: ventas, error: ventasError } = await supabase
    .from('ventas')
    .select('monto_cobrado, litros_vendidos, metodo_pago, tanques(producto)')
    .gte('fecha_registro', inicioDia);

  if (ventasError) {
    throw new Error(`Error consultando ventas: ${ventasError.message}`);
  }

  const registros = ventas || [];
  const ingresos = registros.reduce((acc, v) => acc + Number(v.monto_cobrado || 0), 0);
  const volumen = registros.reduce((acc, v) => acc + Number(v.litros_vendidos || 0), 0);
  const totalTransacciones = registros.length;

  // Desglose por método de pago
  const metodos = registros.reduce((acc, v) => {
    const m = v.metodo_pago || 'Otro';
    acc[m] = (acc[m] || 0) + Number(v.monto_cobrado || 0);
    return acc;
  }, {});

  // 2. Configurar Nodemailer
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

  const desgloseHtml = Object.entries(metodos).map(([metodo, monto]) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">${metodo}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">$${monto.toFixed(2)}</td>
    </tr>
  `).join('');

  // 3. Ensamblar y enviar
  await transporter.sendMail({
    from: `"Cross-Station ERP" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: `Reporte de Corte Diario - ${hoyStr} | Cross-Station`,
    text: `Reporte de Corte Diario (${fechaFormateada}):\n\n` +
          `Total Facturado: $${ingresos.toFixed(2)}\n` +
          `Volumen Despachado: ${volumen.toFixed(2)} Litros\n` +
          `Transacciones Realizadas: ${totalTransacciones}\n\n` +
          `---\nSistema automatizado Cross-Station ERP.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px;">CROSS-<span style="color: #60a5fa;">STATION</span></h1>
          <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">SISTEMA AUTOMATIZADO DE GESTIÓN Y CORTE DIARIO</p>
        </div>
        
        <div style="padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="font-size: 18px; color: #1e293b; margin: 0;">Balance del Día</h2>
            <span style="font-size: 13px; color: #64748b; background: #f8fafc; padding: 4px 8px; border-radius: 6px;">${fechaFormateada}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; text-align: center;">
              <span style="font-size: 12px; font-weight: 600; color: #166534; text-transform: uppercase;">Total Facturado</span>
              <div style="font-size: 26px; font-weight: 800; color: #15803d; margin-top: 4px;">$${ingresos.toFixed(2)}</div>
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; text-align: center;">
              <span style="font-size: 12px; font-weight: 600; color: #1e40af; text-transform: uppercase;">Volumen Despachado</span>
              <div style="font-size: 26px; font-weight: 800; color: #2563eb; margin-top: 4px;">${volumen.toFixed(2)} <span style="font-size: 16px;">L</span></div>
            </div>
          </div>

          <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <h3 style="font-size: 14px; color: #475569; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">Desglose por Método de Pago</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${desgloseHtml || '<tr><td style="padding: 8px; color: #94a3b8;">Sin transacciones registradas hoy</td></tr>'}
            </table>
          </div>

          <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
            <p style="margin: 0;">Destinatario programado: <strong>${destinatario}</strong></p>
            <p style="margin: 4px 0 0;">Generado automáticamente por el motor de corte Cross-Station ERP.</p>
          </div>
        </div>
      </div>
    `,
  });

  // 4. Actualizar fecha de último envío (en local y en BD si es posible)
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
    ingresos,
    volumen,
    transacciones: totalTransacciones,
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
