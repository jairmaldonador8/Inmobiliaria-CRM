import { requireAsesor } from '@/lib/auth/usuario-actual'
import { misNotificaciones } from '@/lib/notificaciones/consultas'
import { ListaNotificaciones } from '@/components/notificaciones/lista-notificaciones'

export default async function PaginaNotificacionesAsesor() {
  await requireAsesor()
  const notificaciones = await misNotificaciones()

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Notificaciones</h1>
      </header>

      <div className="lg:max-w-lg">
        <ListaNotificaciones notificaciones={notificaciones} />
      </div>
    </section>
  )
}
