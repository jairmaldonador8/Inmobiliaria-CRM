'use server'

/**
 * Server Action para registrar seguimientos de un lead.
 *
 * Funciona para AMBOS roles con el cliente de SESIÓN: RLS decide — el
 * asesor solo puede insertar seguimientos de SUS leads (con autor_id =
 * auth.uid()), el admin de cualquiera. Sin service-role y sin verificar
 * ownership a mano: si el insert falla por policy, el lead no es suyo.
 *
 * Los seguimientos son INMUTABLES (append-only por RLS): no hay update ni
 * delete aquí ni en la UI.
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { registrarEvento } from '@/lib/eventos/registrar'
import { resolverRecordatoriosVencidos } from '@/lib/recordatorios/resolver'
import {
  MAX_NOTA_SEGUIMIENTO,
  TIPOS_SEGUIMIENTO,
  type TipoSeguimiento,
} from '@/lib/seguimientos/formato'

export type ResultadoSeguimiento = { ok: true } | { error: string }

export type DatosSeguimiento = {
  tipo: string
  nota: string
  propiedadId?: string | null
}

export async function registrarSeguimiento(
  leadId: string,
  datos: DatosSeguimiento
): Promise<ResultadoSeguimiento> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  // 'sistema' queda excluido a propósito: reservado para eventos automáticos.
  if (!(TIPOS_SEGUIMIENTO as readonly string[]).includes(datos.tipo)) {
    return { error: 'El tipo de seguimiento no es válido' }
  }

  const nota = datos.nota?.trim()
  if (!nota) return { error: 'La nota es obligatoria' }
  if (nota.length > MAX_NOTA_SEGUIMIENTO) {
    return { error: `La nota no puede exceder ${MAX_NOTA_SEGUIMIENTO} caracteres` }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('seguimientos').insert({
    lead_id: leadId,
    autor_id: usuario.user_id,
    tipo: datos.tipo as TipoSeguimiento,
    nota,
    propiedad_id: datos.propiedadId || null,
  })

  // Error de policy = el lead no es del asesor (o no existe). Mismo mensaje.
  if (error) {
    return { error: 'No se pudo registrar el seguimiento' }
  }

  await registrarEvento(supabase, leadId, 'seguimiento_registrado', { tipo: datos.tipo }, usuario.user_id)

  // Un seguimiento manual es actividad real: los recordatorios vencidos del
  // autor sobre este lead se dan por hechos (best-effort, ver resolver.ts).
  await resolverRecordatoriosVencidos(supabase, leadId, usuario.user_id)

  revalidatePath(`/asesor/leads/${leadId}`)
  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath('/admin/leads')
  return { ok: true }
}
