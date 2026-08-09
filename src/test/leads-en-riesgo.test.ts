// @vitest-environment node
/**
 * Tests TDD de leadsEnRiesgo() (src/lib/guardias/consultas.ts) — la consulta
 * del panel «Leads en riesgo» del dashboard admin (Fase C).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { leadsEnRiesgo } from '@/lib/guardias/consultas'

const AHORA = new Date('2026-08-10T18:00:00Z')

function hace(minutos: number): string {
  return new Date(AHORA.getTime() - minutos * 60_000).toISOString()
}

function crearTabla(resolver: (filtros: unknown[][]) => { data: unknown; error: unknown }) {
  const filtros: unknown[][] = []
  const c: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolver(filtros)).then(res, rej),
  }
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gt', 'lte', 'limit']) {
    c[m] = (...args: unknown[]) => {
      filtros.push([m, ...args])
      return c
    }
  }
  return c
}

function fakeDb(opciones: {
  pasosDueno: string[] // lead_ids con dueno_120
  leads: { id: string; nombre: string; asesor_id: string; escalamiento_desde: string; asignado_en: string | null }[]
  conRespuestaManual?: string[]
  asesores?: { user_id: string; nombre: string; telefono: string | null }[]
}) {
  const from = vi.fn((tabla: string) => {
    if (tabla === 'lead_escalamientos') {
      return crearTabla(() => ({ data: opciones.pasosDueno.map((id) => ({ lead_id: id })), error: null }))
    }
    if (tabla === 'leads') {
      return crearTabla((filtros) => {
        const idsFiltro = filtros.find((f) => f[0] === 'in')?.[2] as string[]
        return { data: opciones.leads.filter((l) => idsFiltro.includes(l.id)), error: null }
      })
    }
    if (tabla === 'seguimientos') {
      return crearTabla((filtros) => {
        const leadId = filtros.find((f) => f[0] === 'eq' && f[1] === 'lead_id')?.[2] as string
        const tiene = (opciones.conRespuestaManual ?? []).includes(leadId)
        return { data: tiene ? [{ id: 's' }] : [], error: null }
      })
    }
    if (tabla === 'usuarios') {
      return crearTabla(() => ({ data: opciones.asesores ?? [], error: null }))
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })
  return { from } as unknown as SupabaseClient
}

describe('leadsEnRiesgo', () => {
  const ASESORES = [
    { user_id: 'a1', nombre: 'Caro Asesora', telefono: '528110001111' },
    { user_id: 'a2', nombre: 'Beto Asesor', telefono: null },
  ]

  it('sin pasos dueno_120 → lista vacía sin más consultas', async () => {
    const db = fakeDb({ pasosDueno: [], leads: [] })
    expect(await leadsEnRiesgo(db, AHORA)).toEqual([])
  })

  it('arma la fila completa (minutos, asesor con nombre y teléfono) ordenada del más viejo al más nuevo', async () => {
    const db = fakeDb({
      pasosDueno: ['l1', 'l2'],
      leads: [
        { id: 'l1', nombre: 'Ana', asesor_id: 'a1', escalamiento_desde: hace(130), asignado_en: hace(130) },
        { id: 'l2', nombre: 'Luis', asesor_id: 'a2', escalamiento_desde: hace(200), asignado_en: hace(200) },
      ],
      asesores: ASESORES,
    })
    const r = await leadsEnRiesgo(db, AHORA)

    expect(r).toEqual([
      {
        leadId: 'l2', leadNombre: 'Luis', minutosEsperando: 200,
        asesorId: 'a2', asesorNombre: 'Beto Asesor', asesorTelefono: null,
      },
      {
        leadId: 'l1', leadNombre: 'Ana', minutosEsperando: 130,
        asesorId: 'a1', asesorNombre: 'Caro Asesora', asesorTelefono: '528110001111',
      },
    ])
  })

  it('excluye los que ya avanzaron de etapa/archivados (no vuelven de la query) y los contestados después del paso', async () => {
    const db = fakeDb({
      pasosDueno: ['l1', 'l2', 'l3'],
      leads: [
        // l3 no viene: la query de leads ya filtra etapa/archivado
        { id: 'l1', nombre: 'Ana', asesor_id: 'a1', escalamiento_desde: hace(130), asignado_en: hace(130) },
        { id: 'l2', nombre: 'Luis', asesor_id: 'a1', escalamiento_desde: hace(150), asignado_en: hace(150) },
      ],
      conRespuestaManual: ['l2'],
      asesores: ASESORES,
    })
    const r = await leadsEnRiesgo(db, AHORA)
    expect(r.map((x) => x.leadId)).toEqual(['l1'])
  })
})
