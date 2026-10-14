import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { firebaseConfig, useEmulators, type Cloud } from './cloud'
import type { Place } from './places'

/** Fields we store; anything else on the object is dropped (keeps the security rules simple). */
const FIELDS = [
  'name', 'lat', 'lng', 'osmId', 'kind', 'cuisine', 'address', 'openingHours', 'googleUrl', 'source',
  'status', 'addedAt', 'visitedAt',
] as const

function toDoc(place: Place) {
  const out: Record<string, unknown> = { updatedAt: Date.now() }
  for (const key of FIELDS) {
    const value = place[key]
    if (value !== undefined && value !== null && value !== '') out[key] = value
  }
  return out
}

export function createCloud(): Cloud {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  // Offline-first: reads and writes work without a connection and sync when back online.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  })
  if (useEmulators) {
    const host = location.hostname
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
    connectFirestoreEmulator(db, host, 8080)
  }

  const placesCol = (uid: string) => collection(db, 'users', uid, 'places')

  return {
    onUser(cb) {
      return onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, name: u.displayName, email: u.email, photoURL: u.photoURL } : null),
      )
    },

    async signIn() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      try {
        await signInWithPopup(auth, provider)
      } catch (err) {
        const code = (err as { code?: string }).code
        // Some mobile browsers block popups; fall back to a full-page redirect.
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider)
          return
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
        throw err
      }
    },

    signOut: () => signOut(auth),

    watchPlaces(uid, cb, onError) {
      return onSnapshot(
        placesCol(uid),
        { includeMetadataChanges: false },
        (snap) => {
          const places = snap.docs.map((d) => ({ ...(d.data() as Omit<Place, 'id'>), id: d.id }))
          places.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
          cb(places)
        },
        onError,
      )
    },

    // Writes resolve once the server confirms; the local cache (and UI) updates immediately.
    putPlace: (uid, place) => setDoc(doc(placesCol(uid), place.id), toDoc(place)),

    deletePlace: (uid, id) => deleteDoc(doc(placesCol(uid), id)),

    async migrate(uid, local) {
      if (!local.length) return 0
      const existing = await getDocs(placesCol(uid))
      const ids = new Set(existing.docs.map((d) => d.id))
      const osmIds = new Set(existing.docs.map((d) => d.get('osmId')).filter(Boolean))
      const fresh = local.filter((p) => !ids.has(p.id) && !(p.osmId && osmIds.has(p.osmId)))
      for (let i = 0; i < fresh.length; i += 400) {
        const batch = writeBatch(db)
        for (const p of fresh.slice(i, i + 400)) batch.set(doc(placesCol(uid), p.id), toDoc(p))
        await batch.commit()
      }
      return fresh.length
    },
  }
}
