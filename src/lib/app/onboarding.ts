const onboardingStorageKey = 'collage-builder:onboarding-complete:v1'

export function hasCompletedOnboarding(): boolean {
  try {
    return globalThis.localStorage.getItem(onboardingStorageKey) === 'true'
  } catch {
    return false
  }
}

export function completeOnboarding(): void {
  try {
    globalThis.localStorage.setItem(onboardingStorageKey, 'true')
  } catch {
    // The quick start can still be dismissed when local storage is unavailable.
  }
}
