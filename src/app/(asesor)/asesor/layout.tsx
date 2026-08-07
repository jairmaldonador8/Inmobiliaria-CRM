import { requireAsesor } from '@/lib/auth/usuario-actual'
import { Wordmark } from '@/components/marca/wordmark'
import { NavAsesor, NavAsesorSidebar, PieSesionAsesor } from '@/components/nav/nav-asesor'
import { Campana } from '@/components/notificaciones/campana'
import BannerInstalacion from '@/components/push/banner-instalacion'
import RegistroPush from '@/components/push/registro-push'
import { BotonSugerencia } from '@/components/sugerencias/boton-sugerencia'

export default async function AsesorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await requireAsesor()

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-slate-50">
      <RegistroPush />
      <BannerInstalacion />

      {/*
        Sidebar de escritorio (desde `lg`): sustituye a la barra de pestañas
        inferior, que en escritorio es un patrón de teléfono fuera de
        lugar. Misma estructura que el sidebar de (admin) (fixed, w-60,
        NavAdmin + PieSesion) pero con la identidad clara del asesor — el
        admin usa un sidebar oscuro (bg-slate-950); aquí se mantiene el
        blanco/slate del resto del layout del asesor en vez de importar
        ese tema oscuro, que sería un rediseño y no solo un acomodo.
      */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center justify-between gap-2 px-6 pt-6 pb-4">
          <Wordmark className="text-[14px] text-slate-900" />
          <Campana href="/asesor/notificaciones" />
        </div>
        <NavAsesorSidebar />
        <PieSesionAsesor nombre={usuario.nombre} />
      </aside>

      {/* Barra superior móvil/tablet: la sustituye el sidebar desde `lg`. */}
      <header className="sticky top-0 z-30 flex min-h-14 items-center border-b border-slate-200 bg-white px-2 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-2">
          <Wordmark className="text-[14px] text-slate-900" />
          <Campana href="/asesor/notificaciones" />
        </div>
      </header>

      {/*
        Ancho completo en escritorio (antes `max-w-md` — misma columna de
        teléfono también en pantallas grandes; ya no aplica, el dueño del
        producto quiere aprovechar el ancho). pb-52/lg:pb-40: espacio para
        que NINGÚN contenido quede detrás de los botones flotantes (barra
        de pestañas + «Registrar lead» + BotonSugerencia en móvil;
        BotonSugerencia, y «Registrar lead» en el kanban, en escritorio —
        ver boton-sugerencia.tsx y sheet-captura-rapida.tsx).
      */}
      <main className="w-full flex-1 px-4 pt-6 pb-52 lg:ml-60 lg:px-10 lg:pt-8 lg:pb-40">
        {children}
      </main>

      <BotonSugerencia className="lg:bottom-6" />
      <NavAsesor />
    </div>
  )
}
