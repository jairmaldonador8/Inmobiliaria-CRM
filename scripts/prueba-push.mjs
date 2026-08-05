// Prueba end-to-end de Web Push: inserta una notificación (campanita) para el
// admin y manda el push a todos sus dispositivos suscritos, con el mismo
// payload que usa src/lib/push/enviar.ts. Uso: node scripts/prueba-push.mjs
// Lee credenciales de .env.local (nunca las imprime).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

const { data: admins, error: errAdmin } = await supabase
  .from('usuarios')
  .select('user_id, nombre')
  .eq('rol', 'admin')
  .eq('activo', true)
if (errAdmin || !admins?.length) {
  console.error('No se encontró admin activo:', errAdmin?.message)
  process.exit(1)
}

const texto = '🔔 Prueba de notificaciones — si ves esto en tu teléfono, el push de Klo-Ser funciona'
const url = '/admin'

for (const admin of admins) {
  const { error: errNotif } = await supabase
    .from('notificaciones')
    .insert({ destinatario_id: admin.user_id, tipo: 'prueba', texto, url })
  console.log(`Campanita para ${admin.nombre}: ${errNotif ? 'ERROR ' + errNotif.message : 'ok'}`)

  const { data: subs } = await supabase
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth, user_agent, creada_en')
    .eq('usuario_id', admin.user_id)
  if (!subs?.length) {
    console.log(`  Sin suscripciones push para ${admin.nombre} — falta tocar «Activar avisos» en la PWA`)
    continue
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({ title: 'Klo-Ser', body: texto, data: { url } })
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { urgency: 'high' }
      )
      console.log(`  Push enviado → dispositivo ${s.user_agent?.slice(0, 40) ?? s.id} (${s.creada_en})`)
    } catch (e) {
      console.log(`  Push FALLÓ (${e.statusCode ?? e.message}) → ${s.user_agent?.slice(0, 40) ?? s.id}`)
    }
  }
}
