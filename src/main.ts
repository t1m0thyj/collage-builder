import { mount } from 'svelte'
import Konva from 'konva'
import './app.css'
import App from './App.svelte'
import { registerOfflineSupport } from './lib/app/deployment'

if (import.meta.env.PROD) registerOfflineSupport()

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
