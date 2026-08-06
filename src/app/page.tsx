import Image from 'next/image'
import Link from 'next/link'

import { Wordmark } from '@/components/marca/wordmark'
import { Reveal } from '@/components/landing/reveal'
import s from './landing.module.css'

export const metadata = {
  title: 'Klo-Ser — Un buen cierre se construye',
  description:
    'El CRM de Montana Realty: leads de EasyBroker, WhatsApp y referidos en una sola cola que te dice a quién atender primero.',
}

const FlechaDerecha = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

/**
 * Landing pública (port fiel de design-propuestas/landing-klo-ser.html).
 * Con sesión válida el proxy redirige al área del rol antes de llegar aquí;
 * el login del equipo vive en /login.
 */
export default function PaginaInicio() {
  return (
    <div className={s.pagina}>
      <div className={s.grano} aria-hidden />
      <div className={s.wrap}>
        {/* ══════════ TOPNAV ══════════ */}
        <nav className={s.topnav}>
          <div className={s.navBrand}>
            <Wordmark className="text-[17px]" />
          </div>
          <div className={s.navLinks}>
            <a className={s.link} href="#modulos">
              Módulos
            </a>
            <a className={s.link} href="#como">
              Cómo funciona
            </a>
            <Link className={s.btnPrimary} href="/login">
              Iniciar sesión
              {FlechaDerecha}
            </Link>
          </div>
        </nav>

        {/* ══════════ HERO ══════════ */}
        <header className={s.hero}>
          <div className={s.heroCopy}>
            <div className={s.heroKicker}>CRM inmobiliario · Montana Realty</div>

            <div className={s.heroWm} aria-hidden>
              <span className={s.wmK}>klo</span>
              <span className={s.wmDash} />
              <span className={s.wmS}>ser</span>
            </div>

            <h1 className={s.heroHead}>
              Un buen cierre se <span className={s.cafe}>construye.</span>
            </h1>
            <p className={s.heroSub}>
              Klo-Ser junta tus leads de EasyBroker, WhatsApp y referidos en una sola cola
              que te dice <b>a quién atender primero</b> — y no suelta a nadie hasta la
              firma.
            </p>

            <div className={s.heroCtas}>
              <Link className={s.btnPrimary} href="/login">
                Entrar al sistema
                {FlechaDerecha}
              </Link>
              <a className={s.btnGhost} href="#modulos">
                Los módulos
              </a>
            </div>
          </div>
          <div className={s.heroImg}>
            <Image
              src="/landing/mood-01.jpg"
              alt="Volumen ocre contra cielo turquesa"
              fill
              priority
              sizes="(max-width: 920px) 100vw, 45vw"
              style={{ objectFit: 'cover' }}
            />
            <div className={s.phTag}>Obra 01 · Moodboard Klo-Ser</div>
          </div>
        </header>

        {/* ══════════ CINTA DE PRODUCTO ══════════ */}
        <div className={s.productBand}>
          <div className={s.pbHead}>
            <span className={s.pbN}>El sistema</span>
            <h2>Así se ve tu día adentro</h2>
          </div>
          <div className={s.previewGrid}>
            <div className={s.pcard}>
              <div className={s.pLabel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Cierres · Agosto
              </div>
              <div className={s.pBig}>
                6<span className={s.pDelta}>▲ 2</span>
              </div>
              <div className={s.pSub}>Tasa de cierre 14% · vas 1 arriba de julio</div>
              <div className={s.pFoot}>
                Cierre registrado — <b>Lucía Martínez · Terreno Zibatá</b>
              </div>
            </div>

            <div className={s.pcard}>
              <div className={s.pLabel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Tu cola de hoy
              </div>
              <div className={s.pLead}>
                <div className={s.ava}>IR</div>
                <div>
                  <div className={s.pNombre}>Isabel Rentería</div>
                  <div className={s.pMeta}>Sin primer contacto · hace 2 h</div>
                </div>
                <span className={s.pChipHot}>Atiende ahora</span>
              </div>
              <div className={s.pLead}>
                <div className={s.avaB}>HM</div>
                <div>
                  <div className={s.pNombre}>Héctor Morales</div>
                  <div className={s.pMeta}>WhatsApp · busca casa 3R</div>
                </div>
                <span className={s.pChipHot}>Atiende ahora</span>
              </div>
              <div className={s.pLead}>
                <div className={s.avaC}>MF</div>
                <div>
                  <div className={s.pNombre}>María Fernanda López</div>
                  <div className={s.pMeta}>Cita mañana 11:00 · confirmada</div>
                </div>
                <span className={s.pChip}>Cita agendada</span>
              </div>
            </div>

            <div className={s.pcard}>
              <div className={s.pRing}>
                <div className={s.ringbox}>
                  <svg width="76" height="76" aria-hidden>
                    <circle cx="38" cy="38" r="31" fill="none" stroke="#EAE3D6" strokeWidth="7" />
                    <circle
                      cx="38"
                      cy="38"
                      r="31"
                      fill="none"
                      stroke="#6B4A33"
                      strokeWidth="7"
                      strokeLinecap="butt"
                      strokeDasharray="195"
                      strokeDashoffset="78"
                      transform="rotate(-90 38 38)"
                    />
                  </svg>
                  <div className={s.ringN}>60%</div>
                </div>
                <div className={s.ringLbl}>de tu cola de hoy ya está atendida</div>
              </div>
              <div className={s.pFoot}>
                Sync EasyBroker <b>✓ hace 12 min</b>
              </div>
            </div>
          </div>

          {/* Strip */}
          <div className={s.strip}>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 3v6h-6" />
              </svg>
              EasyBroker cada 15 min
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 11.5 2a8.38 8.38 0 0 1 8.5 8.5z" />
              </svg>
              WhatsApp con plantillas
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <path d="M12 18h.01" />
              </svg>
              Instalable en tu teléfono
            </span>
          </div>
        </div>

        {/* ══════════ MÓDULOS ══════════ */}
        <section className={s.block} id="modulos">
          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.secTag}>Los módulos</div>
            <h2>
              Seis piezas, un objetivo: que nada se <span className={s.cafe}>enfríe</span>
            </h2>
            <p className={s.blockLead}>
              Cada módulo existe para empujar al lead un paso más cerca de la firma —
              desde que llega hasta que le entregas la llave.
            </p>
          </Reveal>

          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.featGrid}>
              <div className={s.feat}>
                <div className={s.featNum}>M·01</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                  </svg>
                </div>
                <h3>Cola del día</h3>
                <p>
                  Abres la app y ya sabes qué hacer: <b>«Atiende ahora»</b> para los
                  nuevos sin contacto y <b>«Necesitan seguimiento»</b> para los que llevan
                  más de 24 h en silencio.
                </p>
              </div>
              <div className={s.feat}>
                <div className={s.featNum}>M·02</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <rect x="3" y="3" width="5" height="18" rx="1" />
                    <rect x="10" y="3" width="5" height="12" rx="1" />
                    <rect x="17" y="3" width="5" height="8" rx="1" />
                  </svg>
                </div>
                <h3>Kanban de leads</h3>
                <p>
                  Tu cartera completa de <b>Nuevo a Apartado</b>, arrastrando tarjetas
                  entre etapas. Los leads abandonados se marcan solos.
                </p>
              </div>
              <div className={s.feat}>
                <div className={s.featNum}>M·03</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 11.5 2a8.38 8.38 0 0 1 8.5 8.5z" />
                  </svg>
                </div>
                <h3>WhatsApp con plantillas</h3>
                <p>
                  Un clic y el mensaje sale con el <b>nombre, propiedad y cita ya
                  rellenos</b>. Sin teclear lo mismo dos veces.
                </p>
              </div>
              <div className={s.feat}>
                <div className={s.featNum}>M·04</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                    <path d="M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" />
                  </svg>
                </div>
                <h3>Bandeja de asignación</h3>
                <p>
                  Los leads nuevos caen en una bandeja central y el admin los{' '}
                  <b>reparte en segundos</b>. Ningún lead se queda sin dueño.
                </p>
              </div>
              <div className={s.feat}>
                <div className={s.featNum}>M·05</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M3 21h18" />
                    <path d="M5 21V7l7-4 7 4v14" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </div>
                <h3>Inventario sincronizado</h3>
                <p>
                  Las propiedades llegan solas desde <b>EasyBroker cada 15 minutos</b>:
                  precios, fotos y disponibilidad al día.
                </p>
              </div>
              <div className={s.feat}>
                <div className={s.featNum}>M·06</div>
                <div className={s.featIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </div>
                <h3>Alertas que no perdonan</h3>
                <p>
                  Si un lead lleva <b>más de 24 h sin atención</b>, el admin y el asesor
                  lo ven marcado. La velocidad es la mitad del cierre.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Interludio fotográfico */}
          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.photoBreak}>
              <div className={s.phbg}>
                <Image
                  src="/landing/mood-00.jpg"
                  alt="Muro de concreto al sol"
                  fill
                  sizes="(max-width: 1160px) 100vw, 1160px"
                  style={{ objectFit: 'cover', objectPosition: 'center 60%' }}
                />
              </div>
              <div className={s.photoBreakInner}>
                <div className={s.photoQ}>
                  Cada seguimiento, una <span className={s.ocre}>columna.</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ CÓMO FUNCIONA ══════════ */}
        <section className={s.block} id="como">
          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.secTag}>Cómo funciona</div>
            <h2>
              Del primer clic a la llave, en tres <span className={s.cafe}>pasos</span>
            </h2>
          </Reveal>

          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.steps}>
              <div className={s.stepCard}>
                <div className={s.stepNum}>01</div>
                <h3>El lead llega solo</h3>
                <p>
                  Desde el portal de EasyBroker, un WhatsApp o un referido — cae en la{' '}
                  <b>bandeja central</b> con su propiedad de interés ya vinculada.
                </p>
              </div>
              <div className={s.stepCard}>
                <div className={s.stepNum}>02</div>
                <h3>Su asesor lo toma</h3>
                <p>
                  El admin lo asigna y aparece en la <b>cola del día</b> del asesor:
                  primer contacto por WhatsApp con plantilla, cita agendada, visita.
                </p>
              </div>
              <div className={s.stepCard}>
                <div className={s.stepNum}>03</div>
                <h3>Nada se enfría hasta firmar</h3>
                <p>
                  Cada seguimiento queda en el historial y las alertas de 24 h empujan
                  hasta que la tarjeta llega a <b>«Cerrado ganado»</b>.
                </p>
              </div>
            </div>
          </Reveal>

          {/* CTA final */}
          <Reveal className={s.reveal} inClassName={s.revealIn}>
            <div className={s.finalCta}>
              <div className={s.phbg}>
                <Image
                  src="/landing/mood-05.jpg"
                  alt="Volúmenes de barro y concreto"
                  fill
                  sizes="(max-width: 1160px) 100vw, 1160px"
                  style={{ objectFit: 'cover', objectPosition: 'center 45%' }}
                />
              </div>
              <div className={s.finalCtaInner}>
                <Wordmark
                  className="text-[clamp(26px,4vw,42px)] text-[#F6F1E8]"
                  dashClassName="h-[3px] bg-[#C98A3B]"
                />
                <div className={s.finalCtaClaim}>Un buen cierre se construye</div>
                <Link className={s.btnOcre} href="/login">
                  Iniciar sesión
                  {FlechaDerecha}
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer className={s.footer}>
          <div className={s.navBrand}>
            <Wordmark className="text-[13px]" />
          </div>
          <span>Sistema interno de Montana Realty</span>
          <div className={s.footerRight}>
            <span className={s.footerClaim}>Un buen cierre se construye</span>
            <span>© 2026</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
