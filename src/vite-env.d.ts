/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the short-link expander worker (optional). */
  readonly VITE_LINK_EXPANDER_URL?: string
  /** Firebase web app config (optional; enables Google sign-in + cloud sync). */
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  /** "true" to use the local Firebase emulators. */
  readonly VITE_FIREBASE_EMULATORS?: string
}
