import { requireAdmin } from '@/lib/auth/usuario-actual'
import { listaPlantillas } from '@/lib/plantillas/consultas'
import { Badge } from '@/components/ui/badge'
import { DialogCrearPlantilla } from '@/components/plantillas/dialog-crear-plantilla'
import { MenuAccionesPlantilla } from '@/components/plantillas/menu-acciones-plantilla'

/** Ajustes del admin: CRUD de plantillas de WhatsApp (Task 19). */
export default async function PaginaAjustes() {
  await requireAdmin()
  const plantillas = await listaPlantillas()

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500">
          Los umbrales de vencimiento de leads y las comisiones llegarán en una fase posterior
          (F2).
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Plantillas de WhatsApp</h2>
            <p className="text-sm text-slate-500">
              Se ofrecen a los asesores al enviar un WhatsApp desde el detalle de un lead.
            </p>
          </div>
          <DialogCrearPlantilla />
        </div>

        {plantillas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Aún no hay plantillas. Crea la primera con «Nueva plantilla».
          </p>
        ) : (
          <ul className="grid gap-3">
            {plantillas.map((plantilla) => (
              <li
                key={plantilla.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{plantilla.nombre}</p>
                    <Badge variant={plantilla.activa ? 'default' : 'secondary'}>
                      {plantilla.activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-slate-600">{plantilla.texto}</p>
                </div>
                <MenuAccionesPlantilla plantilla={plantilla} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
