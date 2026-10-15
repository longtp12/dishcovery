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
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QuerySnapshot,
} from 'firebase/firestore'
import { firebaseConfig, useEmulators, type Cloud } from './cloud'
import type { Place, PlaceList, Scope, SharedPlace } from './places'

/** Fields we store; anything else on the object is dropped (keeps the security rules simple). */
const INFO_FIELDS = [
  'name', 'lat', 'lng', 'osmId', 'kind', 'cuisine', 'address', 'openingHours', 'googleUrl', 'googleId',
] as const
const BASE_FIELDS = [...INFO_FIELDS, 'sharedId', 'source', 'status', 'addedAt', 'visitedAt'] as const
const PLACE_FIELDS = [...BASE_FIELDS, 'rating', 'review'] as const
/** Shared-list places also record who added and who visited them. */
// Members' reviews (the `reviews` map) are written separately, one member at a time.
const LIST_PLACE_FIELDS = [...BASE_FIELDS, 'addedBy', 'addedByName', 'visitedBy', 'visitedByName', 'updatedBy'] as const
const SHARED_FIELDS = [...INFO_FIELDS, 'addedBy', 'addedByName', 'createdAt'] as const

function pick<T extends object>(obj: T, fields: readonly (keyof T)[]) {
  const out: Record<string, unknown> = { updatedAt: Date.now() }
  for (const key of fields) {
    const value = obj[key]
    if (value !== undefined && value !== null && value !== '') out[key as string] = value
  }
  return out
}

const toDoc = (scope: Scope, place: Place) => pick(place, scope === 'mine' ? PLACE_FIELDS : LIST_PLACE_FIELDS)
const LIST_FIELDS = ['name', 'ownerUid', 'ownerName', 'memberEmails', 'memberUids', 'createdAt'] as const

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
    connectFirestoreEmulator(db, host, Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT) || 8080)
  }

  const placesCol = (uid: string, scope: Scope = 'mine') =>
    scope === 'mine' ? collection(db, 'users', uid, 'places') : collection(db, 'lists', scope, 'places')
  const sharedCol = collection(db, 'sharedPlaces')
  const listsCol = collection(db, 'lists')
  const toList = (snap: QuerySnapshot) => snap.docs.map((d) => ({ ...(d.data() as Omit<PlaceList, 'id'>), id: d.id }))

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

    watchPlaces(uid, scope, cb, onError) {
      return onSnapshot(
        placesCol(uid, scope),
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
    putPlace(uid, scope, place) {
      const ref = doc(placesCol(uid, scope), place.id)
      const data = toDoc(scope, place)
      if (scope === 'mine') return setDoc(ref, data)
      // Shared-list places: merge so members' reviews stay; clear fields that were removed.
      for (const key of LIST_PLACE_FIELDS) if (!(key in data)) data[key] = deleteField()
      return setDoc(ref, data, { merge: true })
    },

    putReview: (uid, listId, placeId, review) =>
      updateDoc(doc(placesCol(uid, listId), placeId), {
        [`reviews.${uid}`]: review ?? deleteField(),
        updatedBy: uid,
        updatedAt: Date.now(),
      }),

    deletePlace: (uid, scope, id) => deleteDoc(doc(placesCol(uid, scope), id)),

    async migrate(uid, local) {
      if (!local.length) return 0
      const existing = await getDocs(placesCol(uid))
      const ids = new Set(existing.docs.map((d) => d.id))
      const osmIds = new Set(existing.docs.map((d) => d.get('osmId')).filter(Boolean))
      const fresh = local.filter((p) => !ids.has(p.id) && !(p.osmId && osmIds.has(p.osmId)))
      for (let i = 0; i < fresh.length; i += 400) {
        const batch = writeBatch(db)
        for (const p of fresh.slice(i, i + 400)) batch.set(doc(placesCol(uid), p.id), toDoc('mine', p))
        await batch.commit()
      }
      return fresh.length
    },

    watchShared(cb, onError) {
      return onSnapshot(
        sharedCol,
        (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<SharedPlace, 'id' | 'source'>), id: d.id, source: 'google' }))),
        onError,
      )
    },

    addShared: (place) => setDoc(doc(sharedCol, place.id), pick(place, SHARED_FIELDS)),

    updateShared: (id, patch) => updateDoc(doc(sharedCol, id), { ...patch, updatedAt: Date.now() }),

    deleteShared: (id) => deleteDoc(doc(sharedCol, id)),

    watchLists(user, cb, onError) {
      // Lists you own, plus lists your email was invited to (usually the same ones for an owner).
      let owned: PlaceList[] = []
      let invited: PlaceList[] = []
      const emit = () => {
        const byId = new Map([...owned, ...invited].map((l) => [l.id, l]))
        cb([...byId.values()].sort((a, b) => a.createdAt - b.createdAt))
      }
      const unsubs = [
        onSnapshot(query(listsCol, where('ownerUid', '==', user.uid)), (s) => ((owned = toList(s)), emit()), onError),
      ]
      if (user.email) {
        unsubs.push(
          onSnapshot(
            query(listsCol, where('memberEmails', 'array-contains', user.email.toLowerCase())),
            (s) => ((invited = toList(s)), emit()),
            onError,
          ),
        )
      }
      return () => unsubs.forEach((u) => u())
    },

    createList(list) {
      const ref = doc(listsCol)
      return { id: ref.id, done: setDoc(ref, pick(list, LIST_FIELDS)) }
    },

    updateList: (id, patch) => updateDoc(doc(listsCol, id), { ...patch, updatedAt: Date.now() }),

    joinList: (id, uid) => updateDoc(doc(listsCol, id), { memberUids: arrayUnion(uid), updatedAt: Date.now() }),

    leaveList: (id, uid, email) =>
      updateDoc(doc(listsCol, id), {
        memberEmails: arrayRemove(email.toLowerCase()),
        memberUids: arrayRemove(uid),
        updatedAt: Date.now(),
      }),

    async deleteList(id) {
      const places = await getDocs(placesCol('', id))
      const docs = places.docs.map((d) => d.ref)
      // The list itself goes last, in the final batch, so members keep access until its places are gone.
      for (let i = 0; i < docs.length || i === 0; i += 400) {
        const batch = writeBatch(db)
        for (const ref of docs.slice(i, i + 400)) batch.delete(ref)
        if (i + 400 >= docs.length) batch.delete(doc(listsCol, id))
        await batch.commit()
      }
    },
  }
}
