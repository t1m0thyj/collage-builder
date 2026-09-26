import { readonly, writable } from 'svelte/store'

export type DeploymentStatus = 'checking' | 'offline-ready' | 'update-ready' | 'online-only'

export interface DeploymentState {
  status: DeploymentStatus
  message: string
  detail?: string
}

const state = writable<DeploymentState>({
  status: 'checking',
  message: 'Checking offline support…',
})

export const deploymentState = readonly(state)

let registration: ServiceWorkerRegistration | undefined
let reloadForUpdate = false

function watchRegistration(nextRegistration: ServiceWorkerRegistration): void {
  registration = nextRegistration
  if (nextRegistration.waiting && navigator.serviceWorker.controller)
    state.set({ status: 'update-ready', message: 'Update ready' })

  nextRegistration.addEventListener('updatefound', () => {
    const installing = nextRegistration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state !== 'installed') return
      state.set(
        navigator.serviceWorker.controller
          ? { status: 'update-ready', message: 'Update ready' }
          : { status: 'offline-ready', message: 'Offline ready' },
      )
    })
  })
}

export function registerOfflineSupport(): void {
  if (import.meta.env.DEV) {
    state.set({
      status: 'online-only',
      message: 'Dev mode',
      detail: 'Offline support is enabled in the production build.',
    })
    return
  }
  if (!('serviceWorker' in navigator)) {
    state.set({ status: 'online-only', message: 'Online only' })
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadForUpdate) globalThis.location.reload()
  })

  const startRegistration = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then(async (nextRegistration) => {
        watchRegistration(nextRegistration)
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Offline setup timed out.')), 10_000)
            }),
          ])
          state.update((current) =>
            current.status === 'checking'
              ? { status: 'offline-ready', message: 'Offline ready' }
              : current,
          )
        } finally {
          clearTimeout(timeoutId)
        }
      })
      .catch((error: unknown) => {
        state.update((current) =>
          current.status === 'checking'
            ? {
                status: 'online-only',
                message: 'Online only',
                detail:
                  error instanceof Error ? error.message : 'Offline support could not be enabled.',
              }
            : current,
        )
      })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', startRegistration, { once: true })
  else startRegistration()
}

export async function applyAvailableUpdate(
  preserveUnsavedWork: () => Promise<boolean>,
): Promise<boolean> {
  const waiting = registration?.waiting
  if (!waiting || !(await preserveUnsavedWork())) return false
  reloadForUpdate = true
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}
