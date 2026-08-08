'use server'

/**
 * Server Actions de los contactos de WhatsApp.
 *
 * Cliente de SESIÓN siempre: RLS decide qué lead es de quién. Si un insert
 * falla por policy, el lead no es del asesor — no se verifica a mano.
 *
 * BEST-EFFORT POR DISEÑO, igual que `avance-automatico.ts`: cuando estas
 * funciones corren, WhatsApp YA se abrió en el teléfono del asesor. Perder
 * una fila es preferible a mostrarle un error por algo que ya ocurrió.
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { avanzarEtapaPorEvento } from '@/lib/leads/avance-automatico'

export type ResultadoContactoAccion = { ok: true } | { error: string }

/** Dos toques en este lapso son el mismo contacto, no dos. */
const VENTANA_DEDUPE_MS = 5 * 60 * 1000

function revalidarAsesor(leadId: string) {
  // `registrarSeguimiento` NO revalida /asesor ni /asesor/leads, y esta
  // acción sí mueve la etapa y alimenta la cola del día: sin estas dos, la
  // lista «Sin respuesta» no aparece hasta una recarga dura.
  revalidatePath('/asesor')
  revalidatePath('/asesor/leads')
  revalidatePath(`/asesor/leads/${leadId}`)
}

export async function registrarSalidaWhatsapp(
  leadId: string,
  datos: { nombrePlantilla?: string | null }
): Promise<ResultadoContactoAccion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const supabase = await createClient()

  // El seguimiento se escribe SIEMPRE, aunque el dedupe suprima el contacto:
  // hoy cada toque deja rastro en el timeline y quitarlo sería una regresión.
  const nota = datos.nombrePlantilla
    ? `Se envió plantilla "${datos.nombrePlantilla}"`
    : 'Mensaje directo por WhatsApp'

  const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
    lead_id: leadId,
    autor_id: usuario.user_id,
    tipo: 'whatsapp',
    nota,
  })
  if (errorSeguimiento) {
    return { error: 'No se pudo registrar el seguimiento' }
  }

  // El comportamiento instrumentado es SOLO del asesor dueño del lead. Un
  // admin revisando un lead ajeno no le deja pendientes a nadie ni le mueve
  // el pipeline. La regla vive aquí, no duplicada en los componentes.
  if (usuario.rol !== 'asesor') {
    revalidatePath(`/admin/leads/${leadId}`)
    revalidatePath('/admin/leads')
    return { ok: true }
  }

  // Dedupe: se lee y luego se escribe, sin transacción. Dos toques
  // simultáneos pueden crear dos filas; se acepta (ver spec). Nada aguas
  // abajo asume «un solo pendiente por lead».
  const { data: pendientes } = await supabase
    .from('contactos_whatsapp')
    .select('id, creado_en')
    .eq('lead_id', leadId)
    .eq('resultado', 'pendiente')

  const ahora = Date.now()
  const hayReciente = (pendientes ?? []).some(
    (c) => ahora - new Date(c.creado_en).getTime() < VENTANA_DEDUPE_MS
  )

  if (!hayReciente) {
    // Los pendientes viejos se degradan (en plural: pueden ser varios). Es
    // el registro honesto de que ese intento nunca se reportó.
    if ((pendientes ?? []).length > 0) {
      await supabase
        .from('contactos_whatsapp')
        .update({ resultado: 'sin_reporte', resuelto_en: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('resultado', 'pendiente')
    }

    // OJO: el insert lleva SOLO (lead_id, autor_id). El grant de la tabla no
    // incluye `resultado` — mandarlo explícito, aunque fuera 'pendiente',
    // truena con «permission denied for column resultado». El default de la
    // columna es quien lo pone.
    const { error: errorContacto } = await supabase
      .from('contactos_whatsapp')
      .insert({ lead_id: leadId, autor_id: usuario.user_id })
    if (errorContacto) {
      console.error('No se pudo registrar el contacto:', errorContacto.message)
    }
  }

  // Avance de etapa: solo empuja desde 'nuevo'; la regla pura decide.
  const { data: lead } = await supabase
    .from('leads')
    .select('etapa')
    .eq('id', leadId)
    .maybeSingle()

  if (lead) {
    await avanzarEtapaPorEvento(supabase, {
      leadId,
      etapaActual: lead.etapa,
      destino: 'contactado',
      autorId: usuario.user_id,
      motivo: 'whatsapp_enviado',
    })
  }

  revalidarAsesor(leadId)
  return { ok: true }
}
