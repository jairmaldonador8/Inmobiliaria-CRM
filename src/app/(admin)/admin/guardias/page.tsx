import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { leerConfiguracion, type Guardia } from '@/lib/guardias/consultas'
import { fechaHoyMonterrey } from '@/lib/fechas/monterrey'
import { CalendarioGuardias } from '@/components/guardias/calendario-guardias'
import { ConfiguracionGuardiasForm } from '@/components/guardias/configuracion-guardias-form'

export const dynamic = 'force-dynamic'

import { mesRelativo, RE_MES, ultimoDiaDelMes } from '@/lib/guardias/calendario'
import { ROLES_QUE_ASESORAN } from '@/lib/asesores/roles'

/**
 * Admin → Guardias: calendario del mes (tap en día → asignar turnos),
 * «copiar semana anterior», huecos futuros en rojo, y la configuración de
 * VIP/escalamiento/horarios (spec Fase B, pantalla 1).
 */
export default async function PaginaGuardias({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  await requireAdmin()

  const { mes: mesParam } = await searchParams
  const hoy = fechaHoyMonterrey()
  const mes = mesParam && RE_MES.test(mesParam) ? mesParam : hoy.slice(0, 7)

  const supabase = createAdminClient()
  const [{ data: guardias }, config, { data: usuariosActivos }] = await Promise.all([
    supabase
      .from('guardias')
      .select('id, fecha, turno, hora_inicio, hora_fin, asesor_id')
      .gte('fecha', `${mes}-01`)
      .lte('fecha', ultimoDiaDelMes(mes))
      .order('fecha'),
    leerConfiguracion(supabase),
    supabase
      .from('usuarios')
      .select('user_id, nombre, rol')
      .eq('activo', true)
      .order('nombre'),
  ])

  const usuarios = usuariosActivos ?? []
  // Los admins también ejercen de asesores (modelo admin-operador), así que
  // entran al rol de guardias con su misma cuenta.
  const asesores = usuarios
    .filter((u) => ROLES_QUE_ASESORAN.includes(u.rol))
    .map((u) => ({ userId: u.user_id, nombre: u.nombre }))

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Guardias</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quién atiende los leads que caen solos — tap en un día para asignar los turnos
        </p>
      </header>

      <CalendarioGuardias
        mes={mes}
        mesAnterior={mesRelativo(mes, -1)}
        mesSiguiente={mesRelativo(mes, 1)}
        hoy={hoy}
        guardias={(guardias ?? []) as Guardia[]}
        asesores={asesores}
      />

      <ConfiguracionGuardiasForm
        config={config}
        usuarios={usuarios.map((u) => ({ userId: u.user_id, nombre: u.nombre, rol: u.rol }))}
      />
    </section>
  )
}
