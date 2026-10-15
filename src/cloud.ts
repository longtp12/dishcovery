import type { MemberReview, Place, PlaceList, Scope, SharedPlace } from './places'

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
  /** Places in a scope: the user's own ('mine') or a shared list's. */
  watchPlaces(uid: string, scope: Scope, cb: (places: Place[]) => void, onError: (err: Error) => void): () => void
  putPlace(uid: string, scope: Scope, place: Place): Promise<void>
  deletePlace(uid: string, scope: Scope, id: string): Promise<void>
  /** Sets (or with null, clears) your own review of a shared-list place; other members' are untouched. */
  putReview(uid: string, listId: string, placeId: string, review: MemberReview | null): Promise<void>
  /** Copies places that aren't in the account yet (matched by id or OSM id). Returns how many were added. */
  migrate(uid: string, local: Place[]): Promise<number>

  /** Community places (sharedPlaces/{id}), readable by every signed-in user. */
  watchShared(cb: (places: SharedPlace[]) => void, onError: (err: Error) => void): () => void
  addShared(place: SharedPlace): Promise<void>
  updateShared(id: string, patch: { name: string }): Promise<void>
  deleteShared(id: string): Promise<void>

  /** Shared lists the user owns or was invited to (by email). */
  watchLists(user: CloudUser, cb: (lists: PlaceList[]) => void, onError: (err: Error) => void): () => void
  /** Returns the new list's id straight away; the write syncs in the background. */
  createList(list: Omit<PlaceList, 'id'>): { id: string; done: Promise<void> }
  updateList(id: string, patch: Partial<Pick<PlaceList, 'name' | 'memberEmails'>>): Promise<void>
  joinList(id: string, uid: string): Promise<void>
  leaveList(id: string, uid: string, email: string): Promise<void>
  /** Deletes the list and all its places (owner only). */
  deleteList(id: string): Promise<void>
}

let cloud: Promise<Cloud> | null = null

export function getCloud(): Promise<Cloud> {
  if (!cloudConfigured) return Promise.reject(new Error('Cloud sync is not configured'))
  cloud ??= import('./cloudImpl').then((m) => m.createCloud())
  return cloud
}
