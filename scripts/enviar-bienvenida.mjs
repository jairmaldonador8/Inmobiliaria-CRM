/**
 * Envía un correo de bienvenida de Klo-Ser vía Resend.
 *
 *   node scripts/enviar-bienvenida.mjs \
 *     --archivo design-propuestas/correo-bienvenida/renata.html \
 *     --para hobbanks@gmail.com \
 *     --asunto "Bienvenida a Klo-Ser, Renata" \
 *     --password "la-contraseña-temporal"
 *
 * La plantilla lleva las imágenes hospedadas en www.klo-ser.com/correo/ y un
 * hueco {{CONTRASENA}} que aquí se rellena (--password; opcional en las
 * plantillas que no lo traen, como la de Fede). La contraseña NUNCA vive en
 * el repo — solo pasa por la línea de comandos.
 *
 * Requiere RESEND_API_KEY (en el entorno o en .env.local) y un dominio
 * verificado en Resend. Remitente por defecto: Klo-Ser <klo@klo-ser.com>,
 * ajustable con --de.
 */
import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'

config({ path: '.env.local', quiet: true })

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const archivo = arg('archivo')
const para = arg('para')
const asunto = arg('asunto')
const password = arg('password')
const de = arg('de') ?? 'Klo-Ser <klo@klo-ser.com>'

if (!archivo || !para || !asunto) {
  console.error('Uso: node scripts/enviar-bienvenida.mjs --archivo <plantilla.html> --para <correo> --asunto "…" [--password "…"] [--de "Nombre <correo>"]')
  process.exit(1)
}

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('Falta RESEND_API_KEY en el entorno o en .env.local')
  process.exit(1)
}

let html = await readFile(archivo, 'utf8')
if (html.includes('{{CONTRASENA}}')) {
  if (!password) {
    console.error(`La plantilla ${archivo} espera --password y no llegó`)
    process.exit(1)
  }
  html = html.replaceAll('{{CONTRASENA}}', password)
}

const respuesta = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ from: de, to: [para], subject: asunto, html }),
})

const cuerpo = await respuesta.text()
if (!respuesta.ok) {
  console.error(`Resend respondió ${respuesta.status}: ${cuerpo}`)
  process.exit(1)
}
console.log(`ENVIADO a ${para} — id ${JSON.parse(cuerpo).id}`)
