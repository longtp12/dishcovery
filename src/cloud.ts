import type { Place } from './places'

/**
 * Optional cloud sync (Firebase Auth + Firestore, free Spark plan).
 * Enabled when the VITE_FIREBASE_* config is present; otherwise places stay in this browser only.
 * Firebase itself is loaded lazily (see cloudImpl.ts) so it costs nothing until used.
 */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}

/** Local emulators instead of the real project (for development/testing). */
export const useEmulators = env.VITE_FIREBASE_EMULATORS === 'true'

export const cloudConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

export interface CloudUser {
  uid: string
  name: string | null
  email: string | null
  photoURL: string | null
}

export interface Cloud {
  onUser(cb: (user: CloudUser | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
  watchPlaces(uid: string, cb: (places: Place[]) => void, onError: (err: Error) => void): () => void
  putPlace(uid: string, place: Place): Promise<void>
  deletePlace(uid: string, id: string): Promise<void>
  /** Copies places that aren't in the account yet (matched by id or OSM id). Returns how many were added. */
  migrate(uid: string, local: Place[]): Promise<number>
}

let cloud: Promise<Cloud> | null = null

export function getCloud(): Promise<Cloud> {
  if (!cloudConfigured) return Promise.reject(new Error('Cloud sync is not configured'))
  cloud ??= import('./cloudImpl').then((m) => m.createCloud())
  return cloud
}
