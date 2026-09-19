import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();

    // Soporte para análisis total (array de tanques) o unitario
    const listaTanques = Array.isArray(body.tanques)
      ? body.tanques
      : body.capacidad_maxima
      ? [body]
      : [];

    if (listaTanques.length === 0) {
      throw new Error('No se enviaron datos de tanques para proyectar');
    }

    // 1. Cálculos de base física real para cada tanque
    const tanquesAnalizados = listaTanques.map((t) => {
      const cap = Number(t.capacidad_maxima) || 35000;
      const vol = Number(t.volumen_actual) || 0;
      const promedio = Number(t.ventas_promedio) || 2500;
      const porcentaje = cap > 0 ? Math.min(100, Math.max(0, Math.round((vol / cap) * 100))) : 0;
      const diasAutonomia = promedio > 0 ? parseFloat((vol / promedio).toFixed(1)) : 0;
      
      // Si tiene menos del 40% requiere recarga prioritaria.
      // Si está por encima del 80%, el tanque está en nivel óptimo y no requiere pedido hoy (0 L).
      const necesitaRecarga = porcentaje < 40;
      const volumenSugerido = porcentaje < 80 ? Math.round(cap - vol) : 0;

      return {
        id: t.id,
        codigo_tanque: t.codigo_tanque || 'Tanque',
        producto: t.producto || 'Combustible',
        capacidad_maxima: cap,
        volumen_actual: vol,
        porcentaje,
        dias_autonomia: diasAutonomia,
        necesita_recarga: necesitaRecarga,
        volumen_sugerido_litros: volumenSugerido
      };
    });

    const tanquesQueRequieren = tanquesAnalizados.filter((t) => t.necesita_recarga || t.volumen_sugerido_litros > 0);
    const totalTanques = tanquesAnalizados.length;

    let estadoGeneral = 'Optimo';
    let resumenRegla = '';

    if (tanquesQueRequieren.length === 0) {
      estadoGeneral = 'Optimo';
      resumenRegla = 'Todos los tanques tienen bastante combustible. No hace falta pedir camión por ahora.';
    } else if (tanquesQueRequieren.length === totalTanques) {
      estadoGeneral = 'Critico';
      resumenRegla = '¡Atención! Todos los tanques están bajos. Conviene pedir camión cisterna para toda la estación cuanto antes.';
    } else {
      estadoGeneral = 'Atencion';
      const codigos = tanquesQueRequieren.map((t) => t.codigo_tanque).join(', ');
      resumenRegla = `Hace falta pedir combustible para: ${codigos}. Los demás tanques tienen suficiente por ahora.`;
    }

    // 2. Consulta a LLaMA para redacción amigable
    const apiKey = process.env.NVIDIA_API_KEY;
    let justificacionIA = resumenRegla;

    if (apiKey) {
      try {
        const resumenDatos = tanquesAnalizados
          .map(
            (t) =>
              `- Tanque ${t.codigo_tanque} (${t.producto}): ${t.volumen_actual}L de ${t.capacidad_maxima}L (${t.porcentaje}% lleno), dura aprox ${t.dias_autonomia} días.`
          )
          .join('\n');

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'meta/llama-3.2-11b-vision-instruct',
            messages: [
              {
                role: 'system',
                content:
                  "Eres un asesor operativo de estaciones de combustible. Tu objetivo es explicarle al encargado de forma sencilla, humana y sin tecnicismos si hace falta recargar suministro de alguno, de todos, o de ninguno de los tanques. Responde con un único texto breve de 2 líneas máximo, directo y amigable."
              },
              {
                role: 'user',
                content: `Analiza la estación completa con estos datos reales:\n${resumenDatos}\nEstado: ${resumenRegla}\nDevuelve el consejo para el encargado.`
              }
            ],
            temperature: 0.1,
            max_tokens: 150
          })
        });

        if (response.ok) {
          const result = await response.json();
          const content = result.choices?.[0]?.message?.content?.trim();
          if (content) {
            justificacionIA = content.replace(/```/g, '').trim();
          }
        }
      } catch (aiErr) {
        console.warn('Uso de resumen de regla por fallo en llamada externa:', aiErr.message);
      }
    }

    return NextResponse.json({
      proyeccion: {
        tipo: 'total',
        estado_general: estadoGeneral,
        requiere_alguno: tanquesQueRequieren.length > 0,
        requieren_todos: tanquesQueRequieren.length === totalTanques,
        requiere_ninguno: tanquesQueRequieren.length === 0,
        cantidad_a_recargar: tanquesQueRequieren.length,
        resumen: justificacionIA,
        tanques: tanquesAnalizados
      }
    });
  } catch (error) {
    console.error('Fallo /api/proyeccion:', error.message);
    return NextResponse.json(
      { error: error.message || 'Error al proyectar abastecimiento' },
      { status: 500 }
    );
  }
}
