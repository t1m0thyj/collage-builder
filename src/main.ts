import { mount } from 'svelte'
import Konva from 'konva'
import './app.css'
import App from './App.svelte'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}service-worker.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch((error: unknown) => {
          console.warn('Offline support could not be enabled.', error)
        })
    },
    { once: true },
  )
}

// WebKit can occasionally invalidate a freshly allocated canvas while Konva is
// probing for canvas-fingerprinting protection. A failed probe must not prevent
// the editor from mounting; regular hit-canvas rendering remains available.
try {
  Konva.Util.isCanvasFarblingActive()
} catch {
  Konva.Util.isCanvasFarblingActive = () => false
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
