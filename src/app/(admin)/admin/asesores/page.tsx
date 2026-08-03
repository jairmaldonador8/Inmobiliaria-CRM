import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DialogCrearAsesor } from '@/components/asesores/dialog-crear-asesor'
import { MenuAccionesAsesor } from '@/components/asesores/menu-acciones-asesor'

/** Etapas que ya no cuentan como trabajo activo del asesor. */
const ETAPAS_CERRADAS = ['cerrado_ganado', 'cerrado_perdido']

type FilaAsesor = {
  userId: string
  nombre: string
  email: string
  telefono: string | null
  activo: boolean
  leadsActivos: number
}

async function obtenerAsesores(): Promise<FilaAsesor[]> {
  const supabase = createAdminClient()

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('user_id, nombre, telefono, activo, creado_en')
    .eq('rol', 'asesor')
    .order('creado_en', { ascending: true })

  const asesores = usuarios ?? []
  if (asesores.length === 0) return []

  const ids = asesores.map((a) => a.user_id)

  // Conteo de leads activos por asesor: una sola consulta filtrada,
  // agregada en memoria (no hay `group by` directo en supabase-js).
  const { data: leadsActivos } = await supabase
    .from('leads')
    .select('asesor_id')
    .in('asesor_id', ids)
    .eq('archivado', false)
    .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`)

  const conteoPorAsesor = new Map<string, number>()
  for (const lead of leadsActivos ?? []) {
    if (!lead.asesor_id) continue
    conteoPorAsesor.set(lead.asesor_id, (conteoPorAsesor.get(lead.asesor_id) ?? 0) + 1)
  }

  // El correo no vive en `usuarios`: se obtiene de auth.admin.listUsers()
  // y se mapea por id. Suficiente a esta escala (decenas de asesores).
  const { data: listado } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const emailPorId = new Map((listado?.users ?? []).map((u) => [u.id, u.email ?? '—']))

  return asesores.map((a) => ({
    userId: a.user_id,
    nombre: a.nombre,
    email: emailPorId.get(a.user_id) ?? '—',
    telefono: a.telefono,
    activo: a.activo,
    leadsActivos: conteoPorAsesor.get(a.user_id) ?? 0,
  }))
}

export default async function PaginaAsesores() {
  await requireAdmin()
  const asesores = await obtenerAsesores()

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Asesores</h1>
        <DialogCrearAsesor />
      </header>

      {asesores.length === 0 ? (
        <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-sm text-slate-500">Todavía no hay asesores registrados</p>
        </div>
      ) : (
        <>
          {/* Tabla — escritorio */}
          <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Leads activos</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asesores.map((asesor) => (
                  <TableRow key={asesor.userId}>
                    <TableCell className="font-medium text-slate-900">{asesor.nombre}</TableCell>
                    <TableCell className="text-slate-600">{asesor.email}</TableCell>
                    <TableCell className="text-slate-600">{asesor.telefono ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={asesor.activo ? 'secondary' : 'outline'}>
                        {asesor.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{asesor.leadsActivos}</TableCell>
                    <TableCell>
                      <MenuAccionesAsesor asesor={asesor} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tarjetas — móvil */}
          <div className="grid gap-3 lg:hidden">
            {asesores.map((asesor) => (
              <div
                key={asesor.userId}
                className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{asesor.nombre}</p>
                    <p className="truncate text-sm text-slate-500">{asesor.email}</p>
                  </div>
                  <MenuAccionesAsesor asesor={asesor} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                  <Badge variant={asesor.activo ? 'secondary' : 'outline'}>
                    {asesor.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <span>{asesor.telefono ?? 'Sin teléfono'}</span>
                  <span>
                    {asesor.leadsActivos} lead{asesor.leadsActivos === 1 ? '' : 's'} activo
                    {asesor.leadsActivos === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
