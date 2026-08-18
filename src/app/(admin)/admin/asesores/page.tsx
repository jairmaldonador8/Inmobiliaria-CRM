import Link from 'next/link'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { obtenerAsesores } from '@/lib/asesores/consultas'
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
                    <TableCell className="font-medium text-slate-900">
                      <Link
                        href={`/admin/asesores/${asesor.userId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {asesor.nombre}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{asesor.email}</TableCell>
                    <TableCell className="text-slate-600">{asesor.telefono ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={asesor.activo ? 'secondary' : 'outline'}>
                          {asesor.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                        {asesor.rol === 'admin' && <Badge variant="outline">Admin</Badge>}
                        {asesor.activo && !asesor.tienePush && (
                          <Badge className="bg-amber-100 text-amber-700">Sin notificaciones</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{asesor.leadsActivos}</TableCell>
                    <TableCell>
                      {/* Una cuenta admin no se desactiva desde aquí: le quitaría
                          todo el acceso, no solo su faceta de asesor. */}
                      {asesor.rol === 'asesor' && <MenuAccionesAsesor asesor={asesor} />}
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
                    <Link
                      href={`/admin/asesores/${asesor.userId}`}
                      className="block truncate font-medium text-slate-900 underline-offset-4 hover:underline"
                    >
                      {asesor.nombre}
                    </Link>
                    <p className="truncate text-sm text-slate-500">{asesor.email}</p>
                  </div>
                  {asesor.rol === 'asesor' && <MenuAccionesAsesor asesor={asesor} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                  <Badge variant={asesor.activo ? 'secondary' : 'outline'}>
                    {asesor.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {asesor.rol === 'admin' && <Badge variant="outline">Admin</Badge>}
                  {asesor.activo && !asesor.tienePush && (
                    <Badge className="bg-amber-100 text-amber-700">Sin notificaciones</Badge>
                  )}
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
