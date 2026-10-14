// Firestore security rules tests. Run with: npm run test:rules (starts the emulator, needs Java).
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, setLogLevel, updateDoc } from 'firebase/firestore'

let env
setLogLevel('silent') // denied writes are expected; keep the output readable

const user = (uid, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const place = (extra = {}) => ({
  name: 'Phở Thìn',
  lat: 21.0153,
  lng: 105.8553,
  status: 'wishlist',
  source: 'google',
  addedAt: 1,
  ...extra,
})

const shared = (uid, extra = {}) => ({
  name: 'Phở Thìn',
  lat: 21.0153,
  lng: 105.8553,
  googleUrl: 'https://maps.app.goo.gl/abc',
  addedBy: uid,
  addedByName: uid,
  createdAt: 1,
  ...extra,
})

/** Writes data bypassing the rules (test setup). */
const seed = (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dishcovery',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(() => env.cleanup())
beforeEach(() => env.clearFirestore())

describe('own places', () => {
  test('owner can write and read their places', async () => {
    const db = user('alice')
    await assertSucceeds(setDoc(doc(db, 'users/alice/places/p1'), place({ sharedId: 'g-1', googleId: '0x1:0x2' })))
    await assertSucceeds(getDoc(doc(db, 'users/alice/places/p1')))
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/places/p1')))
  })

  test('others and signed-out users cannot', async () => {
    await seed('users/alice/places/p1', place())
    await assertFails(getDoc(doc(user('bob'), 'users/alice/places/p1')))
    await assertFails(setDoc(doc(user('bob'), 'users/alice/places/p2'), place()))
    await assertFails(getDoc(doc(anon(), 'users/alice/places/p1')))
  })

  test('rejects unknown fields and bad values', async () => {
    const db = user('alice')
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ extra: 1 })))
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ status: 'maybe' })))
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ lat: 200 })))
  })
})

describe('community places', () => {
  test('any signed-in user can add, everyone signed in can read', async () => {
    await assertSucceeds(setDoc(doc(user('alice'), 'sharedPlaces/g-1'), shared('alice')))
    await assertSucceeds(getDoc(doc(user('bob'), 'sharedPlaces/g-1')))
    await assertSucceeds(getDocs(collection(user('bob'), 'sharedPlaces')))
  })

  test('signed-out users cannot read or add', async () => {
    await seed('sharedPlaces/g-1', shared('alice'))
    await assertFails(getDoc(doc(anon(), 'sharedPlaces/g-1')))
    await assertFails(getDocs(collection(anon(), 'sharedPlaces')))
    await assertFails(setDoc(doc(anon(), 'sharedPlaces/g-2'), shared('alice')))
  })

  test('cannot add in someone else’s name', async () => {
    await assertFails(setDoc(doc(user('bob'), 'sharedPlaces/g-1'), shared('alice')))
  })

  test('needs a Google link and valid fields', async () => {
    const db = user('alice')
    const { googleUrl: _, ...noLink } = shared('alice')
    await assertFails(setDoc(doc(db, 'sharedPlaces/g-1'), noLink))
    await assertFails(setDoc(doc(db, 'sharedPlaces/g-1'), shared('alice', { status: 'visited' })))
    await assertFails(setDoc(doc(db, 'sharedPlaces/g-1'), shared('alice', { name: '' })))
  })

  test('only the adder can edit or delete', async () => {
    await seed('sharedPlaces/g-1', shared('alice'))
    await assertFails(updateDoc(doc(user('bob'), 'sharedPlaces/g-1'), { name: 'Mine now' }))
    await assertFails(deleteDoc(doc(user('bob'), 'sharedPlaces/g-1')))
    // Re-adding an existing place overwrites it, so it's an update: not allowed for others.
    await assertFails(setDoc(doc(user('bob'), 'sharedPlaces/g-1'), shared('bob')))
    await assertSucceeds(updateDoc(doc(user('alice'), 'sharedPlaces/g-1'), { name: 'Phở Thìn Lò Đúc', updatedAt: 2 }))
    await assertSucceeds(deleteDoc(doc(user('alice'), 'sharedPlaces/g-1')))
  })

  test('the adder cannot hand it over or change when it was added', async () => {
    await seed('sharedPlaces/g-1', shared('alice'))
    await assertFails(updateDoc(doc(user('alice'), 'sharedPlaces/g-1'), { addedBy: 'bob' }))
    await assertFails(updateDoc(doc(user('alice'), 'sharedPlaces/g-1'), { createdAt: 5 }))
  })
})
