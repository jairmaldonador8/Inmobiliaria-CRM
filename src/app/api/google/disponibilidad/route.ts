/**
 * Disponibilidad de un asesor para un rango de tiempo (Task 9).
 *
 * `GET /api/google/disponibilidad?asesor=<id>&desde=<ISO>&hasta=<ISO>` —
 * pensada para consultarse desde la UI de agendar/reagendar (advertir sin
 * bloquear) y, más adelante, desde el self-scheduling de leads.
 *
 * Autorización explícita (no delegada al proxy): un asesor solo puede
 * consultar SU PROPIA disponibilidad; un admin puede consultar la de
 * cualquiera. `usuarioActual()` (no `requireAsesor`/`requireAdmin`, que
 * redirigen) porque esta ruta la consume `fetch` desde un Client Component —
 * necesita un 401/403 en JSON, nunca una redirección.
 *
 * La respuesta NUNCA incluye títulos ni detalle de eventos: solo bloques de
 * tiempo (`obtenerDisponibilidad` ya lo garantiza — free/busy de Google no
 * expone más que eso, y las visitas del CRM se reducen a inicio/fin).
 */
import { NextResponse, type NextRequest } from 'next/server'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { obtenerDisponibilidad, RANGO_MAXIMO_DIAS_DISPONIBILIDAD } from '@/lib/google/disponibilidad'

const MS_POR_DIA = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const usuario = await usuarioActual()
  if (!usuario) {
    return NextResponse.json({ error: 'Tu sesión no es válida' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const asesorId = searchParams.get('asesor')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  const excluirVisita = searchParams.get('excluirVisita') ?? undefined

  if (!asesorId || !desde || !hasta) {
    return NextResponse.json(
      { error: 'Faltan parámetros: asesor, desde y hasta son obligatorios' },
      { status: 400 }
    )
  }

  // Un asesor solo puede consultar su propia disponibilidad; un admin puede
  // consultar la de cualquiera. Nunca al revés — un asesor no puede espiar
  // la agenda de otro.
  if (usuario.rol !== 'admin' && usuario.user_id !== asesorId) {
    return NextResponse.json(
      { error: 'No tienes permiso para consultar la disponibilidad de este asesor' },
      { status: 403 }
    )
  }

  const fechaDesde = new Date(desde)
  const fechaHasta = new Date(hasta)
  if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
    return NextResponse.json(
      { error: 'desde y hasta deben ser fechas ISO 8601 válidas' },
      { status: 400 }
    )
  }
  if (fechaHasta.getTime() <= fechaDesde.getTime()) {
    return NextResponse.json({ error: 'hasta debe ser posterior a desde' }, { status: 400 })
  }
  if (fechaHasta.getTime() - fechaDesde.getTime() > RANGO_MAXIMO_DIAS_DISPONIBILIDAD * MS_POR_DIA) {
    return NextResponse.json(
      { error: `El rango consultado no puede superar ${RANGO_MAXIMO_DIAS_DISPONIBILIDAD} días` },
      { status: 400 }
    )
  }

  const resultado = await obtenerDisponibilidad(
    asesorId,
    { desde, hasta },
    { excluirVisitaId: excluirVisita }
  )
  return NextResponse.json(resultado)
}
