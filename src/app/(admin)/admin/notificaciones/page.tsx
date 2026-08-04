import { requireAdmin } from '@/lib/auth/usuario-actual'
import { misNotificaciones } from '@/lib/notificaciones/consultas'
import { ListaNotificaciones } from '@/components/notificaciones/lista-notificaciones'

export default async function PaginaNotificacionesAdmin() {
  await requireAdmin()
  const notificaciones = await misNotificaciones()

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notificaciones</h1>
      </header>

      <div className="max-w-lg">
        <ListaNotificaciones notificaciones={notificaciones} />
      </div>
    </section>
  )
}
