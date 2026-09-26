/**
 * Exactly-once poem likes.
 *
 * Used as an ES module by every page that renders a like button, so the logic
 * lives in one place instead of being copy-pasted into six inline scripts.
 *
 * Why this file exists
 * --------------------
 * Every previous handler followed this shape:
 *
 *     const snap = await getDoc(ref);
 *     const likedBy = snap.data().likedBy || [];
 *     if (likedBy.includes(uid)) { ...decrement... } else { ...increment... }
 *     await updateDoc(ref, ...);
 *
 * That read-then-write is not atomic. Two clicks inside the same round trip both
 * read "not liked", both take the increment branch, and one user ends up with
 * two likes. Several handlers also appended the uid with a spread
 * (`[...likedBy, uid]`), which could persist the same uid twice and permanently
 * inflate the count. One handler read one field name and wrote another
 * (`likes` vs `totalLikes`), so concurrent updates silently lost changes.
 *
 * The whole decision now happens inside a transaction, so Firestore retries on
 * conflict and the toggle is applied exactly once.
 */

/**
 * Strips duplicate and non-string entries. Documents written by the old
 * spread-append handlers may already contain repeats; removing them here is what
 * lets the derived counter heal.
 */
export function dedupeLikedBy(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const uid of raw) {
    if (typeof uid !== 'string' || uid === '' || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/**
 * Rebuilds likedByTimestamps so it stays the same length and order as likedBy.
 * The weekly-likes maths zips the two arrays by index, so a length or ordering
 * mismatch attributes like times to the wrong users.
 *
 * Times are carried across per uid rather than by index, so an existing entry
 * keeps its original timestamp. Refreshing it would make an old like look new
 * and corrupt the weekly ranking.
 *
 * @param {object} data raw document data
 * @param {Array} rawLikedBy likedBy exactly as stored, BEFORE de-duplication.
 *   The stored timestamps line up with this array, not with the cleaned one, so
 *   the uid -> timestamp map has to be built from here. Using the de-duplicated
 *   array shifts every index after the first repeat and hands users the wrong
 *   timestamps.
 * @param {Array} nextLikedBy the array about to be written
 * @param {Function} serverTimestamp
 */
function alignTimestamps(data, rawLikedBy, nextLikedBy, serverTimestamp) {
  const old = Array.isArray(data.likedByTimestamps) ? data.likedByTimestamps : [];
  const byUid = new Map();
  for (let i = 0; i < rawLikedBy.length; i++) {
    const uid = rawLikedBy[i];
    // First occurrence wins, matching how the array was originally appended.
    if (typeof uid === 'string' && uid !== '' && !byUid.has(uid) && i < old.length && old[i] !== undefined) {
      byUid.set(uid, old[i]);
    }
  }
  const stamp = serverTimestamp();
  return nextLikedBy.map((uid) => (byUid.has(uid) ? byUid.get(uid) : stamp));
}

/**
 * Builds the like API against a page's already-initialised Firestore handles.
 * Passing the handles in avoids a second app initialisation, which previously
 * caused an init race.
 *
 * @param {object} deps
 * @param {object} deps.db
 * @param {Function} deps.runTransaction
 * @param {Function} deps.doc
 * @param {Function} deps.updateDoc
 * @param {Function} deps.serverTimestamp
 */
export function createLikeApi(deps) {
  const db = deps && deps.db;
  const runTransaction = deps && deps.runTransaction;
  const doc = deps && deps.doc;
  const updateDoc = deps && deps.updateDoc;
  const serverTimestamp = deps && deps.serverTimestamp;

  if (!db || typeof runTransaction !== 'function' || typeof doc !== 'function' ||
      typeof updateDoc !== 'function' || typeof serverTimestamp !== 'function') {
    throw new Error('createLikeApi requires db, runTransaction, doc, updateDoc and serverTimestamp');
  }

  /**
   * Atomically flips one user's like on a poem.
   *
   * Idempotent by construction: the decision comes from the snapshot the
   * transaction just read, so a retried or duplicated call cannot double count.
   *
   * @returns {Promise<{ok:boolean, liked:boolean, likes:number, wasLiked:boolean,
   *                    changed:boolean, reason?:string}>}
   */
  async function toggle(options) {
    const collectionName = options && options.collection;
    const poemId = options && options.poemId;
    const userId = options && options.userId;

    if (!collectionName || !poemId || !userId) {
      throw new Error('toggle() requires collection, poemId and userId');
    }

    return runTransaction(db, async (tx) => {
      const ref = doc(db, collectionName, poemId);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        return { ok: false, liked: false, likes: 0, wasLiked: false, changed: false, reason: 'missing' };
      }

      const data = snap.data() || {};
      // Captured before de-duplication, because that is the array the stored
      // timestamps are aligned to.
      const rawLikedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
      const likedBy = dedupeLikedBy(rawLikedBy);
      const wasLiked = likedBy.includes(userId);
      const nextLikedBy = wasLiked
        ? likedBy.filter((uid) => uid !== userId)
        : likedBy.concat([userId]);

      // likes is derived from the de-duplicated array rather than incremented.
      // That makes a double click impossible to over-count and repairs any
      // document the old handlers already inflated.
      await tx.update(ref, {
        likes: nextLikedBy.length,
        likedBy: nextLikedBy,
        likedByTimestamps: alignTimestamps(data, rawLikedBy, nextLikedBy, serverTimestamp)
      });

      return {
        ok: true,
        liked: !wasLiked,
        likes: nextLikedBy.length,
        wasLiked,
        changed: true
      };
    });
  }

  /**
   * Client-side re-entrancy guard. The transaction makes the write safe, but
   * without this a fast double click still fires two round trips and the user
   * sees the button flip twice.
   *
   * @returns {boolean} true when the caller may proceed.
   */
  function guard(element) {
    if (!element) return false;
    if (element.dataset.liking === 'true') return false;
    element.dataset.liking = 'true';
    return true;
  }

  function release(element) {
    if (element) element.dataset.liking = 'false';
  }

  /**
   * Paints the button and counter from a toggle result, so every page reflects
   * the state the database actually holds.
   */
  function apply(button, countElement, result) {
    if (button) button.classList.toggle('liked', !!result.liked);
    if (countElement) countElement.textContent = result.likes;
  }

  return { toggle, guard, release, apply, dedupeLikedBy };
}
