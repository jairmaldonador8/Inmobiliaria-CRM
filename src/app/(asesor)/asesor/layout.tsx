import { requireAsesor } from '@/lib/auth/usuario-actual'
import { Wordmark } from '@/components/marca/wordmark'
import { CambiarVista } from '@/components/nav/cambiar-vista'
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
    <div
      className="flex min-h-dvh flex-1 flex-col bg-slate-50"
      /*
        Alto real de la barra de pestañas inferior: 4rem del <ul> + 1px del
        borde superior + la barra de gestos del iPhone. Lo publica el layout
        porque el layout es quien monta esa barra (ver NavAsesor); cualquier
        elemento fijo que deba quedar POR ENCIMA de ella (la barra de acciones
        de la ficha de propiedad) lo lee de aquí en vez de copiar el número.
        Sin el `env()`, en un iPhone con barra de gestos la nav crece ~34px y
        se comería lo que estuviera anclado a una altura fija.
      */
      style={
        { '--alto-nav': 'calc(4rem + 1px + env(safe-area-inset-bottom))' } as React.CSSProperties
      }
    >
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
      {/*
        SIN `w-full`: junto con `lg:ml-60` daba 100% del viewport MÁS los
        240px de margen del sidebar, y la página entera desbordaba 240px en
        horizontal (medido: scrollWidth 1680 en un viewport de 1440, con el
        enlace «Ver cerrados» fuera de pantalla en x=1509). Como elemento de
        bloque estirado por el flex-col padre, el ancho automático ya ocupa
        justo lo que queda a la derecha del sidebar. Es el mismo patrón del
        <main> de (admin), que nunca tuvo el problema.
      */}
      <main className="flex-1 px-4 pt-6 pb-52 lg:ml-60 lg:px-10 lg:pt-8 lg:pb-40">
        {/*
          Tope de ancho en escritorio: sin él, en un monitor de 2560px el
          contenido queda pegado al sidebar por un lado y las líneas de
          texto se estiran sin límite. `max-w-7xl` centrado en el área a la
          derecha del sidebar da margen a los dos lados sin renunciar al
          ancho ya ganado en monitores normales (a 1440px cabe de sobra).
        */}
        <div className="mx-auto w-full max-w-7xl">
          <CambiarVista vista="asesor" rol={usuario.rol} />
          {children}
        </div>
      </main>

      <BotonSugerencia className="lg:bottom-6" />
      <NavAsesor />
    </div>
  )
}
