import { requireAsesor } from '@/lib/auth/usuario-actual'
import { Wordmark } from '@/components/marca/wordmark'
import { NavAsesor } from '@/components/nav/nav-asesor'
import { Campana } from '@/components/notificaciones/campana'
import BannerInstalacion from '@/components/push/banner-instalacion'
import RegistroPush from '@/components/push/registro-push'
import { BotonSugerencia } from '@/components/sugerencias/boton-sugerencia'

export default async function AsesorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAsesor()

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-slate-50">
      <RegistroPush />
      <BannerInstalacion />
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white px-2">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-2">
          <Wordmark className="text-[14px] text-slate-900" />
          <Campana href="/asesor/notificaciones" />
        </div>
      </header>

      {/* Columna angosta también en escritorio: los asesores trabajan desde el teléfono */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-28">
        {children}
      </main>

      <BotonSugerencia />
      <NavAsesor />
    </div>
  )
}
