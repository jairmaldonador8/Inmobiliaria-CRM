// @vitest-environment node
/**
 * Tests TDD para las consultas de guardias (src/lib/guardias/consultas.ts):
 * ventanas de turno en America/Monterrey, guardia activa, siguiente guardia,
 * configuración tipada con defaults y la regla VIP.
 *
 * Monterrey es UTC-6 fijo (sin horario de verano desde 2022): 09:00 local
 * = 15:00Z. Las horas de Postgres `time` llegan como 'HH:MM:SS'.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ventanaGuardia,
  guardiaActiva,
  siguienteGuardia,
  leerConfiguracion,
  esLeadVip,
  CONFIG_DEFAULTS,
  type Guardia,
  type ConfiguracionGuardias,
} from '@/lib/guardias/consultas'

function guardia(sobrescribir: Partial<Guardia> = {}): Guardia {
  return {
    id: 'g1',
    fecha: '2026-08-10',
    turno: 'manana',
    hora_inicio: '09:00:00',
    hora_fin: '15:00:00',
    asesor_id: 'asesor-1',
    ...sobrescribir,
  }
}

/** Stub de supabase para `.from('guardias').select().in()` y `.gte().order().order().limit()`. */
function supabaseGuardias(filas: Guardia[]) {
  const consulta = {
    select: vi.fn(() => consulta),
    in: vi.fn(() => Promise.resolve({ data: filas, error: null })),
    gte: vi.fn(() => consulta),
    order: vi.fn(() => consulta),
    limit: vi.fn(() => Promise.resolve({ data: filas, error: null })),
  }
  const from = vi.fn(() => consulta)
  return { supabase: { from } as unknown as SupabaseClient, from, consulta }
}

describe('ventanaGuardia', () => {
  it('convierte un turno normal a instantes UTC (Monterrey = UTC-6)', () => {
    const v = ventanaGuardia(guardia())
    expect(v.inicio.toISOString()).toBe('2026-08-10T15:00:00.000Z')
    expect(v.fin.toISOString()).toBe('2026-08-10T21:00:00.000Z')
  })

  it('hora_fin 00:00 significa medianoche del día SIGUIENTE', () => {
    const v = ventanaGuardia(guardia({ turno: 'tarde', hora_inicio: '15:00:00', hora_fin: '00:00:00' }))
    expect(v.inicio.toISOString()).toBe('2026-08-10T21:00:00.000Z')
    // 00:00 Monterrey del 11 = 06:00Z del 11
    expect(v.fin.toISOString()).toBe('2026-08-11T06:00:00.000Z')
  })

  it('acepta horas HH:mm sin segundos (defaults de configuracion)', () => {
    const v = ventanaGuardia(guardia({ hora_inicio: '09:00', hora_fin: '15:00' }))
    expect(v.inicio.toISOString()).toBe('2026-08-10T15:00:00.000Z')
  })
})

describe('guardiaActiva', () => {
  it('devuelve la guardia cuya ventana cubre ahora (inicio inclusive)', async () => {
    const g = guardia()
    const { supabase } = supabaseGuardias([g])
    // 09:00 Monterrey exacto = 15:00Z
    expect(await guardiaActiva(supabase, new Date('2026-08-10T15:00:00Z'))).toEqual(g)
  })

  it('el fin es exclusivo: a la hora exacta de cierre ya no está de guardia', async () => {
    const { supabase } = supabaseGuardias([guardia()])
    expect(await guardiaActiva(supabase, new Date('2026-08-10T21:00:00Z'))).toBeNull()
  })

  it('hueco entre turnos → null', async () => {
    const manana = guardia({ hora_fin: '13:00:00' })
    const tarde = guardia({ id: 'g2', turno: 'tarde', hora_inicio: '16:00:00', hora_fin: '00:00:00' })
    const { supabase } = supabaseGuardias([manana, tarde])
    // 14:00 Monterrey = 20:00Z: entre turnos
    expect(await guardiaActiva(supabase, new Date('2026-08-10T20:00:00Z'))).toBeNull()
  })

  it('a las 23:00 de Monterrey el turno tarde (hasta 00:00) sigue activo', async () => {
    const tarde = guardia({ id: 'g2', turno: 'tarde', hora_inicio: '15:00:00', hora_fin: '00:00:00' })
    const { supabase } = supabaseGuardias([tarde])
    expect(await guardiaActiva(supabase, new Date('2026-08-11T05:00:00Z'))).toEqual(tarde)
  })

  it('propaga error de la consulta (el caller decide bandeja)', async () => {
    const consulta = {
      select: vi.fn(() => consulta),
      in: vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
    }
    const supabase = { from: vi.fn(() => consulta) } as unknown as SupabaseClient
    await expect(guardiaActiva(supabase, new Date())).rejects.toThrow('boom')
  })
})

describe('siguienteGuardia', () => {
  it('salta guardias que ya empezaron y devuelve la próxima futura', async () => {
    const manana = guardia() // empezó 15:00Z
    const tarde = guardia({ id: 'g2', turno: 'tarde', hora_inicio: '15:00:00', hora_fin: '00:00:00' })
    const { supabase } = supabaseGuardias([manana, tarde])
    // 10:00 Monterrey = 16:00Z: mañana ya empezó, la siguiente es la tarde
    expect(await siguienteGuardia(supabase, new Date('2026-08-10T16:00:00Z'))).toEqual(tarde)
  })

  it('sin rol cargado → null', async () => {
    const { supabase } = supabaseGuardias([])
    expect(await siguienteGuardia(supabase, new Date('2026-08-10T16:00:00Z'))).toBeNull()
  })

  it('ordena por instante de inicio real, no por orden de filas', async () => {
    const tardeHoy = guardia({ id: 'g2', turno: 'tarde', hora_inicio: '15:00:00', hora_fin: '00:00:00' })
    const mananaManiana = guardia({ id: 'g3', fecha: '2026-08-11' })
    const { supabase } = supabaseGuardias([mananaManiana, tardeHoy])
    expect(await siguienteGuardia(supabase, new Date('2026-08-10T16:00:00Z'))).toEqual(tardeHoy)
  })
})

function supabaseConfiguracion(filas: { clave: string; valor: unknown }[]) {
  const consulta = { select: vi.fn(() => Promise.resolve({ data: filas, error: null })) }
  return { from: vi.fn(() => consulta) } as unknown as SupabaseClient
}

describe('leerConfiguracion', () => {
  it('valores null del seed → defaults tipados', async () => {
    const supabase = supabaseConfiguracion([
      { clave: 'umbral_vip_mxn', valor: null },
      { clave: 'dueno_user_id', valor: null },
      { clave: 'correo_dueno', valor: null },
    ])
    const config = await leerConfiguracion(supabase)
    expect(config).toEqual(CONFIG_DEFAULTS)
  })

  it('parsea los valores reales del jsonb', async () => {
    const supabase = supabaseConfiguracion([
      { clave: 'umbral_vip_mxn', valor: 8_000_000 },
      { clave: 'dueno_user_id', valor: 'dueno-1' },
      { clave: 'correo_dueno', valor: 'dueno@klo-ser.com' },
      { clave: 'escalamiento_min', valor: { recordatorio: 10, abierto: 20, dueno: 60 } },
      { clave: 'turno_manana', valor: { inicio: '08:00', fin: '14:00' } },
    ])
    const config = await leerConfiguracion(supabase)
    expect(config.umbralVipMxn).toBe(8_000_000)
    expect(config.duenoUserId).toBe('dueno-1')
    expect(config.correoDueno).toBe('dueno@klo-ser.com')
    expect(config.escalamientoMin).toEqual({ recordatorio: 10, abierto: 20, dueno: 60 })
    expect(config.turnoManana).toEqual({ inicio: '08:00', fin: '14:00' })
    expect(config.turnoTarde).toEqual(CONFIG_DEFAULTS.turnoTarde)
  })
})

describe('esLeadVip', () => {
  const config = (umbral: number | null): ConfiguracionGuardias => ({
    ...CONFIG_DEFAULTS,
    umbralVipMxn: umbral,
    duenoUserId: 'dueno-1',
  })

  /** Stub con respuestas por tabla: propiedades_internas y propiedades. */
  function supabaseVip(exclusiva: boolean | null, precio: number | null) {
    const from = vi.fn((tabla: string) => {
      const fila =
        tabla === 'propiedades_internas'
          ? exclusiva === null ? null : { exclusiva }
          : precio === null ? null : { precio }
      const consulta = {
        select: vi.fn(() => consulta),
        eq: vi.fn(() => consulta),
        maybeSingle: vi.fn(() => Promise.resolve({ data: fila, error: null })),
      }
      return consulta
    })
    return { supabase: { from } as unknown as SupabaseClient, from }
  }

  it('sin propiedad → nunca VIP', async () => {
    const { supabase, from } = supabaseVip(null, null)
    expect(await esLeadVip(supabase, null, config(1))).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('exclusiva → VIP aunque no haya umbral', async () => {
    const { supabase } = supabaseVip(true, null)
    expect(await esLeadVip(supabase, 'p1', config(null))).toBe(true)
  })

  it('precio >= umbral → VIP aunque no sea exclusiva', async () => {
    const { supabase } = supabaseVip(false, 9_000_000)
    expect(await esLeadVip(supabase, 'p1', config(8_000_000))).toBe(true)
  })

  it('precio < umbral y no exclusiva → no VIP', async () => {
    const { supabase } = supabaseVip(false, 5_000_000)
    expect(await esLeadVip(supabase, 'p1', config(8_000_000))).toBe(false)
  })

  it('umbral null (sin configurar) → solo la exclusiva cuenta', async () => {
    const { supabase, from } = supabaseVip(false, 99_000_000)
    expect(await esLeadVip(supabase, 'p1', config(null))).toBe(false)
    // no debe ni consultar propiedades si no hay umbral
    expect(from).toHaveBeenCalledTimes(1)
  })
})
