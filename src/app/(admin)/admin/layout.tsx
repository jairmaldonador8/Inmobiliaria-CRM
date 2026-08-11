import { requireAdmin } from '@/lib/auth/usuario-actual'
import { Wordmark } from '@/components/marca/wordmark'
import { CambiarVista } from '@/components/nav/cambiar-vista'
import { BarraMovilAdmin, NavAdmin, PieSesion } from '@/components/nav/nav-admin'
import { TabBarAdmin } from '@/components/nav/tab-bar-admin'
import { Campana } from '@/components/notificaciones/campana'
import BannerInstalacion from '@/components/push/banner-instalacion'
import RegistroPush from '@/components/push/registro-push'
import { BotonSugerencia } from '@/components/sugerencias/boton-sugerencia'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await requireAdmin()

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col bg-slate-50"
      /*
        Alto real de la píldora de pestañas inferior: 3.125rem de la píldora +
        su separación al borde, que crece con la barra de gestos del iPhone
        (ver TabBarAdmin, `pb-[max(0.75rem,env(safe-area-inset-bottom))]`). Lo
        publica el layout, que es quien la monta, para que lo que deba quedar
        por encima (la barra de acciones de la ficha de propiedad) no copie el
        número y se desincronice. Misma variable que en (asesor), con el valor
        de ESTA barra: las dos no miden lo mismo.
      */
      style={
        {
          '--alto-nav': 'calc(3.125rem + max(0.75rem, env(safe-area-inset-bottom)))',
        } as React.CSSProperties
      }
    >
      <RegistroPush />
      <BannerInstalacion />
      {/* Sidebar de escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-slate-950 text-slate-100 lg:flex">
        <div className="flex items-center justify-between gap-2 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <Wordmark
              className="text-[15px] text-[#EFE9DD]"
            />
            <p className="mt-1.5 text-[8.5px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Montana Realty
            </p>
          </div>
          <Campana
            href="/admin/notificaciones"
            className="text-slate-400 hover:bg-slate-900 hover:text-white"
          />
        </div>
        <NavAdmin />
        <PieSesion nombre={usuario.nombre} />
      </aside>

      {/* Barra superior móvil */}
      <BarraMovilAdmin
        campana={
          <Campana
            href="/admin/notificaciones"
            className="text-slate-300 hover:bg-slate-900 hover:text-white"
          />
        }
      />

      <main className="flex-1 px-4 pt-6 pb-28 lg:ml-60 lg:px-10 lg:py-8">
        <CambiarVista vista="admin" rol={usuario.rol} />
        {children}
      </main>

      {/* El admin no tiene el FAB «+ Registrar lead» encima, así que va
          pegado a la píldora de pestañas y no un piso más arriba. */}
      <BotonSugerencia className="bottom-[calc(var(--alto-nav,4rem)+0.75rem)] lg:bottom-6" />
      <TabBarAdmin nombre={usuario.nombre} />
    </div>
  )
}
