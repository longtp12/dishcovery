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

const list = (owner, emails, extra = {}) => ({
  name: 'Hanoi date spots',
  ownerUid: owner,
  ownerName: owner,
  memberEmails: [`${owner}@example.com`, ...emails],
  memberUids: [owner],
  createdAt: 1,
  ...extra,
})

const listPlace = (uid, extra = {}) =>
  place({ addedBy: uid, addedByName: uid, updatedBy: uid, ...extra })

describe('shared lists', () => {
  test('anyone signed in can create a list they own', async () => {
    await assertSucceeds(setDoc(doc(user('alice'), 'lists/l1'), list('alice', ['bob@example.com'])))
    await assertFails(setDoc(doc(user('alice'), 'lists/l2'), list('bob', [])))
    await assertFails(setDoc(doc(user('alice'), 'lists/l3'), list('alice', [], { memberUids: ['alice', 'bob'] })))
    await assertFails(setDoc(doc(anon(), 'lists/l4'), list('alice', [])))
  })

  test('owner and invited emails can read; others cannot', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await assertSucceeds(getDoc(doc(user('alice'), 'lists/l1')))
    await assertSucceeds(getDoc(doc(user('bob'), 'lists/l1')))
    await assertFails(getDoc(doc(user('carol'), 'lists/l1')))
    await assertFails(getDoc(doc(anon(), 'lists/l1')))
  })

  test('an unverified email does not count as invited', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    const unverified = env.authenticatedContext('bob', { email: 'bob@example.com', email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'lists/l1')))
  })

  test('the app’s queries are allowed', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    const { query, where } = await import('firebase/firestore')
    const bob = user('bob')
    await assertSucceeds(getDocs(query(collection(bob, 'lists'), where('memberEmails', 'array-contains', 'bob@example.com'))))
    await assertSucceeds(getDocs(query(collection(bob, 'lists'), where('ownerUid', '==', 'bob'))))
    await assertFails(getDocs(collection(bob, 'lists')))
  })

  test('only the owner renames, manages members and deletes', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await assertFails(updateDoc(doc(user('bob'), 'lists/l1'), { name: 'Bob’s now' }))
    await assertFails(updateDoc(doc(user('bob'), 'lists/l1'), { memberEmails: ['alice@example.com', 'bob@example.com', 'carol@example.com'] }))
    await assertFails(deleteDoc(doc(user('bob'), 'lists/l1')))
    await assertSucceeds(updateDoc(doc(user('alice'), 'lists/l1'), { name: 'Date night', memberEmails: ['alice@example.com', 'carol@example.com'] }))
    await assertFails(updateDoc(doc(user('alice'), 'lists/l1'), { ownerUid: 'carol' }))
    await assertSucceeds(deleteDoc(doc(user('alice'), 'lists/l1')))
  })

  test('an invitee can join (add only their uid) and leave', async () => {
    const { arrayRemove, arrayUnion } = await import('firebase/firestore')
    await seed('lists/l1', list('alice', ['bob@example.com']))
    const bob = user('bob')
    await assertFails(updateDoc(doc(bob, 'lists/l1'), { memberUids: arrayUnion('bob', 'mallory') }))
    await assertSucceeds(updateDoc(doc(bob, 'lists/l1'), { memberUids: arrayUnion('bob'), updatedAt: 2 }))
    await assertFails(updateDoc(doc(user('carol'), 'lists/l1'), { memberUids: arrayUnion('carol') }))
    // Leaving removes only yourself.
    await assertFails(updateDoc(doc(bob, 'lists/l1'), { memberEmails: arrayRemove('alice@example.com') }))
    await assertSucceeds(
      updateDoc(doc(bob, 'lists/l1'), { memberEmails: arrayRemove('bob@example.com'), memberUids: arrayRemove('bob') }),
    )
    await assertFails(getDoc(doc(bob, 'lists/l1')))
  })

  test('members read and write list places; others cannot', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await assertSucceeds(setDoc(doc(user('alice'), 'lists/l1/places/p1'), listPlace('alice')))
    await assertSucceeds(getDocs(collection(user('bob'), 'lists/l1/places')))
    await assertSucceeds(setDoc(doc(user('bob'), 'lists/l1/places/p2'), listPlace('bob')))
    await assertFails(getDocs(collection(user('carol'), 'lists/l1/places')))
    await assertFails(setDoc(doc(user('carol'), 'lists/l1/places/p3'), listPlace('carol')))
    await assertFails(getDocs(collection(anon(), 'lists/l1/places')))
    await assertSucceeds(deleteDoc(doc(user('bob'), 'lists/l1/places/p1')))
  })

  test('removed members lose access to the places', async () => {
    await seed('lists/l1', list('alice', []))
    await seed('lists/l1/places/p1', listPlace('alice'))
    await assertFails(getDoc(doc(user('bob'), 'lists/l1/places/p1')))
  })

  test('who added and who visited are honest', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await seed('lists/l1/places/p1', listPlace('alice'))
    const bob = user('bob')
    // Can't add in someone else's name.
    await assertFails(setDoc(doc(bob, 'lists/l1/places/p2'), listPlace('alice', { updatedBy: 'bob' })))
    // Must stamp yourself as the last editor.
    await assertFails(setDoc(doc(bob, 'lists/l1/places/p1'), listPlace('alice', { status: 'visited' })))
    // Can't rewrite who added it.
    await assertFails(setDoc(doc(bob, 'lists/l1/places/p1'), listPlace('bob')))
    // Marking visited: only as yourself.
    await assertFails(
      setDoc(doc(bob, 'lists/l1/places/p1'), listPlace('alice', { updatedBy: 'bob', status: 'visited', visitedAt: 2, visitedBy: 'alice', visitedByName: 'alice' })),
    )
    await assertSucceeds(
      setDoc(doc(bob, 'lists/l1/places/p1'), listPlace('alice', { updatedBy: 'bob', status: 'visited', visitedAt: 2, visitedBy: 'bob', visitedByName: 'bob' })),
    )
    // Alice can change other fields and keep Bob as the visitor.
    await assertSucceeds(
      setDoc(doc(user('alice'), 'lists/l1/places/p1'), listPlace('alice', { name: 'Phở Thìn Lò Đúc', status: 'visited', visitedAt: 2, visitedBy: 'bob', visitedByName: 'bob' })),
    )
    // And move it back to the wishlist (clears the visitor).
    await assertSucceeds(setDoc(doc(user('alice'), 'lists/l1/places/p1'), listPlace('alice')))
  })

  test('owner can delete the list and its places in one batch', async () => {
    const { writeBatch } = await import('firebase/firestore')
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await seed('lists/l1/places/p1', listPlace('bob'))
    const db = user('alice')
    const batch = writeBatch(db)
    batch.delete(doc(db, 'lists/l1/places/p1'))
    batch.delete(doc(db, 'lists/l1'))
    await assertSucceeds(batch.commit())
  })
})

describe('ratings and reviews', () => {
  test('own places: private 1–5 rating and short review', async () => {
    const db = user('alice')
    await assertSucceeds(setDoc(doc(db, 'users/alice/places/p1'), place({ rating: 4, review: 'Great broth' })))
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ rating: 6 })))
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ rating: 3.5 })))
    await assertFails(setDoc(doc(db, 'users/alice/places/p1'), place({ rating: 4, review: 'x'.repeat(501) })))
    await assertFails(getDoc(doc(user('bob'), 'users/alice/places/p1')))
  })

  test('list places: members write only their own review', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await seed('lists/l1/places/p1', listPlace('alice', { reviews: { alice: { rating: 5, text: 'Love it', name: 'alice', at: 1 } } }))
    const bob = user('bob')
    const ref = doc(bob, 'lists/l1/places/p1')
    await assertSucceeds(updateDoc(ref, { 'reviews.bob': { rating: 3, text: 'Okay', name: 'bob', at: 2 }, updatedBy: 'bob' }))
    // Can't touch someone else's review, or post one in their name.
    await assertFails(updateDoc(ref, { 'reviews.alice': { rating: 1, at: 3 }, updatedBy: 'bob' }))
    await assertFails(updateDoc(ref, { 'reviews.carol': { rating: 1, at: 3 }, updatedBy: 'bob' }))
    const { deleteField } = await import('firebase/firestore')
    await assertFails(updateDoc(ref, { 'reviews.alice': deleteField(), updatedBy: 'bob' }))
    // Bad values.
    await assertFails(updateDoc(ref, { 'reviews.bob': { rating: 0, at: 3 }, updatedBy: 'bob' }))
    await assertFails(updateDoc(ref, { 'reviews.bob': { rating: 4, at: 3, extra: true }, updatedBy: 'bob' }))
    await assertFails(updateDoc(ref, { 'reviews.bob': { rating: 4, text: 'x'.repeat(501), at: 3 }, updatedBy: 'bob' }))
    // Remove your own.
    await assertSucceeds(updateDoc(ref, { 'reviews.bob': deleteField(), updatedBy: 'bob' }))
    // Status changes (merged writes) leave everyone's reviews alone.
    await assertSucceeds(setDoc(ref, { status: 'visited', visitedAt: 4, visitedBy: 'bob', visitedByName: 'bob', updatedBy: 'bob' }, { merge: true }))
    let kept
    await env.withSecurityRulesDisabled(async (ctx) => {
      kept = (await getDoc(doc(ctx.firestore(), 'lists/l1/places/p1'))).data().reviews.alice.rating
    })
    if (kept !== 5) throw new Error('alice’s review was lost')
  })

  test('list places: no private rating fields, and non-members can’t review', async () => {
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await seed('lists/l1/places/p1', listPlace('alice'))
    await assertFails(setDoc(doc(user('alice'), 'lists/l1/places/p2'), listPlace('alice', { rating: 4 })))
    await assertFails(
      updateDoc(doc(user('carol'), 'lists/l1/places/p1'), { 'reviews.carol': { rating: 4, at: 1 }, updatedBy: 'carol' }),
    )
  })
})

describe('settings', () => {
  test('only you can read and write your theme', async () => {
    await assertSucceeds(setDoc(doc(user('alice'), 'users/alice'), { theme: 'mint', updatedAt: 1 }))
    await assertSucceeds(getDoc(doc(user('alice'), 'users/alice')))
    await assertFails(getDoc(doc(user('bob'), 'users/alice')))
    await assertFails(setDoc(doc(user('bob'), 'users/alice'), { theme: 'pop' }))
    await assertFails(getDoc(doc(anon(), 'users/alice')))
  })

  test('nothing but the theme is stored', async () => {
    await assertFails(setDoc(doc(user('alice'), 'users/alice'), { theme: 'mint', isAdmin: true }))
    await assertFails(setDoc(doc(user('alice'), 'users/alice'), { theme: 7 }))
    await assertFails(setDoc(doc(user('alice'), 'users/alice'), { theme: 'x'.repeat(31) }))
  })
})

describe('tags', () => {
  test('own and list places can carry up to 12 tags', async () => {
    await assertSucceeds(setDoc(doc(user('alice'), 'users/alice/places/p1'), place({ tags: ['korean', 'fancy'] })))
    await assertFails(setDoc(doc(user('alice'), 'users/alice/places/p1'), place({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })))
    await assertFails(setDoc(doc(user('alice'), 'users/alice/places/p1'), place({ tags: 'korean' })))
    await seed('lists/l1', list('alice', ['bob@example.com']))
    await assertSucceeds(setDoc(doc(user('bob'), 'lists/l1/places/p1'), listPlace('bob', { tags: ['drinks'] })))
  })
})
