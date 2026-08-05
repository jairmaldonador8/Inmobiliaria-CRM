self.addEventListener('push', (event) => {
  let datos = { title: 'Klo-Ser', body: '', data: { url: '/' } }
  try { datos = { ...datos, ...event.data.json() } } catch {}
  // SIEMPRE mostrar notificación: iOS revoca la suscripción tras ~3 pushes silenciosos.
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: datos.data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (new URL(cliente.url).origin === self.location.origin && 'focus' in cliente) {
          cliente.focus()
          return cliente.navigate ? cliente.navigate(url) : clients.openWindow(url)
        }
      }
      return clients.openWindow(url)
    })
  )
})
