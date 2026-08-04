'use server'

/**
 * Server Actions del asesor sobre SUS leads (kanban + captura rápida).
 *
 * IMPORTANTE: aquí se usa el cliente de SESIÓN (createClient), NUNCA el
 * service-role: RLS es quien garantiza el ownership (un asesor solo lee,
 * actualiza e inserta leads asignados a sí mismo). Si el update no afecta
 * filas es porque el lead no es suyo (o no existe) — no hay que verificar
 * ownership a mano.
 */

import { revalidatePath } from 'next/cache'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { normalizarTelefono } from '@/lib/easybroker/mapeo'
import {
  ETAPAS_LEAD,
  FUENTES_LEAD,
  NOTA_CIERRE,
  type EtapaLead,
  type FuenteLead,
} from '@/lib/leads/formato'

export type ResultadoAccionAsesor = { ok: true } | { error: string }

const RUTA_KANBAN = '/asesor/leads'

/**
 * Mueve un lead del asesor a otra etapa del pipeline.
 *
 * NOTA (deliberada, Task 16): mover a cerrado_ganado / cerrado_perdido por
 * ahora SOLO cambia la etapa. La captura del monto/comisión de la operación
 * llega con el detalle del lead en la Task 16; aquí no se pide nada extra
 * para mantener el kanban rápido en el teléfono.
 */
export async function cambiarEtapa(
  leadId: string,
  etapa: string
): Promise<ResultadoAccionAsesor> {
  const asesor = await requireAsesor()

  if (!(ETAPAS_LEAD as readonly string[]).includes(etapa)) {
    return { error: 'La etapa no es válida' }
  }
  const etapaTipada = etapa as EtapaLead

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leads')
    .update({ etapa: etapaTipada })
    .eq('id', leadId)
    .eq('archivado', false)
    .select('id')

  // 0 filas afectadas = el lead no existe, está archivado o no es del
  // asesor (RLS lo filtró). Mismo mensaje en todos los casos.
  if (error || !data || data.length === 0) {
    return { error: 'No se pudo mover el lead' }
  }

  // Al cerrar (ganado o perdido): registra un seguimiento de sistema con la
  // fecha del cierre. `leads` no tiene columna de fecha de cierre — este
  // registro es lo que permite calcular "cerrados ganados del mes" en la
  // cola del día del asesor (Task 17) sin agregar una columna nueva. Best
  // effort: si falla, NO revertimos el cambio de etapa que ya tuvo éxito.
  if (etapaTipada === 'cerrado_ganado' || etapaTipada === 'cerrado_perdido') {
    const { error: errorCierre } = await supabase.from('seguimientos').insert({
      lead_id: leadId,
      autor_id: asesor.user_id,
      tipo: 'sistema',
      nota: NOTA_CIERRE[etapaTipada],
    })
    if (errorCierre) {
      console.error('No se pudo registrar el seguimiento de cierre:', errorCierre.message)
    }
  }

  revalidatePath(RUTA_KANBAN)
  return { ok: true }
}

export type DatosCapturaAsesor = {
  nombre: string
  telefono: string
  email?: string | null
  fuente: string
  propiedadId?: string | null
}

/**
 * Captura rápida de un lead por el asesor (WhatsApp, llamada, walk-in…).
 * El lead queda asignado a sí mismo — el with-check de RLS solo permite
 * insertar leads con asesor_id = auth.uid().
 *
 * NOTA: asignado_en NO es asignable por authenticated (column grant), así
 * que queda null a propósito. Para métricas de tiempo de respuesta, un
 * lead auto-capturado se considera atendido de inmediato: el asesor ya lo
 * tiene en la mano cuando lo registra.
 *
 * El teléfono se normaliza con normalizarTelefono (52XXXXXXXXXX), el MISMO
 * formato del sync de EasyBroker, para que el dedup por teléfono compare
 * peras con peras.
 */
export async function capturarLeadAsesor(
  datos: DatosCapturaAsesor
): Promise<ResultadoAccionAsesor> {
  const asesor = await requireAsesor()

  const nombre = datos.nombre?.trim()
  if (!nombre) return { error: 'El nombre es obligatorio' }

  const telefono = normalizarTelefono(datos.telefono)
  if (!telefono) return { error: 'El teléfono es obligatorio' }
  if (telefono.length !== 12) return { error: 'El teléfono debe tener 10 dígitos' }

  const email = datos.email?.trim().toLowerCase() || null

  if (!(FUENTES_LEAD as readonly string[]).includes(datos.fuente)) {
    return { error: 'La fuente no es válida' }
  }
  const fuente = datos.fuente as FuenteLead

  const supabase = await createClient()

  // Dedup por teléfono entre los leads VISIBLES para el asesor (RLS: los
  // suyos + ninguno más). Un duplicado contra el lead de OTRO asesor no se
  // detecta aquí — esa vista global es del admin.
  const { data: duplicado, error: errorDup } = await supabase
    .from('leads')
    .select('nombre')
    .eq('telefono', telefono)
    .eq('archivado', false)
    .limit(1)
    .maybeSingle()

  if (errorDup) return { error: 'No se pudo verificar duplicados' }
  if (duplicado) return { error: `Ya tienes un lead con ese teléfono: ${duplicado.nombre}` }

  // Prefill de zona de interés desde la propiedad (colonia, ciudad).
  // El cliente de sesión puede leer propiedades (lectura para authenticated).
  let propiedadId: string | null = null
  let zonaInteres: string | null = null
  if (datos.propiedadId) {
    const { data: propiedad, error: errorPropiedad } = await supabase
      .from('propiedades')
      .select('id, colonia, ciudad')
      .eq('id', datos.propiedadId)
      .maybeSingle()

    if (errorPropiedad || !propiedad) {
      return { error: 'La propiedad seleccionada no existe' }
    }
    propiedadId = propiedad.id
    zonaInteres = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ') || null
  }

  const { error: errorInsertar } = await supabase.from('leads').insert({
    agencia_id: asesor.agencia_id,
    nombre,
    telefono,
    email,
    fuente,
    propiedad_id: propiedadId,
    zona_interes: zonaInteres,
    asesor_id: asesor.user_id,
  })

  if (errorInsertar) {
    return { error: 'No se pudo registrar el lead' }
  }

  revalidatePath(RUTA_KANBAN)
  return { ok: true }
}
