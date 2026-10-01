const { db, loadAdmin, serverTimestamp, increment } = require('./../lib/store-admin.js');

// ============================================================
// FILE: api/verify-paystack-transaction.js
// ============================================================
// Server-authoritative purchase recording for Volant Reads.
//
// The client used to write the `purchases/{uid}_{bookId}` document itself
// AFTER this endpoint merely confirmed the Paystack charge. Because the
// create rule only required `userId == request.auth.uid`, ANY signed-in user
// could hand-write a completed purchase doc and unlock a paid book's full
// file. This endpoint now performs the write itself with the Admin SDK
// (bypassing client rules) so an entitlement can only be granted from a
// genuine, server-verified payment or a server-validated 100% coupon.
//
// Buyer identity comes from a Firebase ID token (`token` in the body), never
// from a client-supplied uid. Amounts for individual books arrive from the
// client because currency conversion happens in the browser, but they are
// constrained by the invariant:
//     sum(priceInGHS) - sum(discountGHS) == the Paystack-verified amount
// so per-book numbers can only redistribute a real, verified charge.
//
// Two modes:
//   (default)  real Paystack payment  -> verify with Paystack, then write.
//   'coupon'   100% coupon (no money) -> validate the coupon server-side,
//                                        then write (no Paystack call).
// ============================================================

// Coupon discount mirroring the client's computeCouponDiscount() so the
// server can independently confirm a 100%-off coupon really covers the cart.
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function couponExpiryMs(coupon) {
  if (!coupon || !coupon.expiresAt) return 0;
  const exp = coupon.expiresAt;
  if (exp.toDate) return exp.toDate().getTime();
  if (typeof exp.seconds === 'number') return exp.seconds * 1000;
  if (exp instanceof Date) return exp.getTime();
  return 0;
}

function couponIsLive(coupon) {
  if (!coupon) return false;
  if (coupon.active === false) return false;
  const exp = couponExpiryMs(coupon);
  if (exp > 0 && exp < Date.now()) return false;
  if (coupon.maxUses > 0 && (Number(coupon.uses) || 0) >= Number(coupon.maxUses)) return false;
  return true;
}

function couponScopeMatches(coupon, item) {
  if (coupon.scope === 'book') return (coupon.bookIds || []).includes(item.bookId);
  if (coupon.scope === 'author') return !!item.authorId && coupon.authorId === item.authorId;
  return true;
}

function couponTotalDiscount(coupon, items) {
  let discount = 0;
  if (coupon.type === 'percent') {
    const percent = Math.min(Number(coupon.value) || 0, 100);
    for (const item of items) {
      discount += round2((Number(item.priceInGHS) || 0) * (percent / 100));
    }
  } else {
    const eligibleTotal = items.reduce((s, i) => s + (Number(i.priceInGHS) || 0), 0);
    const applied = Math.min(Number(coupon.value) || 0, eligibleTotal);
    discount = round2(applied);
  }
  return discount;
}

// Next business day (Mon-Fri), matching the client's nextSettlementDate().
function nextSettlementDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function verifyBuyerIdToken(token) {
  if (!token) {
    const err = new Error('A signed-in session (token) is required to record a purchase.');
    err.status = 401;
    throw err;
  }
  let decoded;
  try {
    decoded = await loadAdmin().auth().verifyIdToken(token);
  } catch (e) {
    const err = new Error('Your session expired. Please sign in again.');
    err.status = 401;
    throw err;
  }
  return decoded;
}

// Normalize the request into a list of { bookId, priceInGHS, discountGHS }.
// Supports the new `items` array and the legacy single `bookId` field.
function normalizeItems(body) {
  const raw = Array.isArray(body.items) ? body.items : [];
  const list = raw
    .filter((i) => i && i.bookId)
    .map((i) => ({
      bookId: String(i.bookId),
      priceInGHS: round2(i.priceInGHS),
      discountGHS: round2(i.discountGHS)
    }));
  if (!list.length && body.bookId) {
    list.push({ bookId: String(body.bookId), priceInGHS: round2(body.amount), discountGHS: 0 });
  }
  return list;
}

function sendError(res, status, message, extra) {
  return res.status(status).json(Object.assign({ success: false, message }, extra || {}));
}

module.exports = async function handler(req, res) {
  // CORS headers (store1 storefront calls this cross-origin).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { amount, email, couponCode, mode } = body;
    const isCouponMode = mode === 'coupon';
    // `let`, not `const`: the coupon path replaces the Paystack reference with a
    // synthetic coupon reference. It used to be destructured with `const` and
    // then reassigned, so every 100% coupon checkout died with
    // "TypeError: Assignment to constant variable" -> HTTP 500.
    let reference = body.reference || null;

    // ===== BUYER IDENTITY (from the Firebase ID token) =====
    const decoded = await verifyBuyerIdToken(body.token);
    const uid = decoded.uid;
    const buyerEmail = decoded.email || email || '';

    // ===== VALIDATE ITEMS =====
    const items = normalizeItems(body);
    if (!items.length) {
      return sendError(res, 400, 'No book was supplied for this purchase.');
    }

    const totalPrice = round2(items.reduce((s, i) => s + i.priceInGHS, 0));
    const totalDiscount = round2(items.reduce((s, i) => s + i.discountGHS, 0));
    const netCharged = round2(totalPrice - totalDiscount);

    // Dedupe book ids (a cart shouldn't double-charge one book).
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.bookId)) {
        return sendError(res, 400, 'Duplicate book in this purchase.');
      }
      seen.add(item.bookId);
    }

    // Load each book doc authoritatively (author, title, pre-order state).
    const firestore = db();
    const books = {};
    for (const item of items) {
      const snap = await firestore.collection('books').doc(item.bookId).get();
      // DocumentSnapshot.exists is a boolean PROPERTY in the Admin SDK, not a
      // method. Calling snap.exists() threw "snap.exists is not a function",
      // which the outer catch turned into a 500 for EVERY purchase.
      if (!snap.exists) {
        return sendError(res, 400, `Book "${item.bookId}" was not found.`);
      }
      const data = snap.data() || {};
      books[item.bookId] = {
        authorId: data.submittedBy || null,
        bookTitle: data.title || 'Unknown',
        preorder: data.preorder === true && data.released !== true,
        preorderReleaseDate: data.preorderReleaseDate || null,
        released: data.released === true
      };
      item.authorId = data.submittedBy || null;
    }

    let transaction = null;
    let coupon = null;
    let customerEmail = buyerEmail;

    // Resolve + validate a coupon server-side. Used by BOTH paths: a 100%
    // coupon is the whole payment, and a partial coupon on a real Paystack
    // charge must still be checked, recorded on the purchase, and counted once.
    const lookupCoupon = async (code) => {
      const norm = String(code || '').trim().toUpperCase();
      if (!norm) return null;
      const snap = await firestore.collection('coupons').where('code', '==', norm).limit(1).get();
      if (snap.empty) {
        const err = new Error('Coupon not found.');
        err.status = 400;
        throw err;
      }
      const found = snap.docs[0].data() || {};
      found.id = snap.docs[0].id;
      if (!couponIsLive(found)) {
        const err = new Error('This coupon is invalid, expired, or has reached its usage limit.');
        err.status = 400;
        throw err;
      }
      return found;
    };

    if (isCouponMode) {
      // ===== 100% COUPON PATH (no money charged) =====
      if (!couponCode) {
        return sendError(res, 400, 'A coupon code is required.');
      }
      if (netCharged > 0.005) {
        return sendError(res, 400, 'This coupon does not cover the full cart total.');
      }
      coupon = await lookupCoupon(couponCode);
      const eligible = items.filter((i) => couponScopeMatches(coupon, i));
      if (!eligible.length) {
        return sendError(res, 400, "This coupon doesn't apply to any books in the cart.");
      }
      const serverDiscount = couponTotalDiscount(coupon, eligible);
      if (round2(totalPrice - serverDiscount) > 0.005) {
        return sendError(res, 400, 'This coupon does not cover the full cart total.');
      }
      reference = coupon.id ? `coupon_${coupon.id}` : 'coupon';
    } else {
      // ===== REAL PAYSTACK PAYMENT =====
      if (!reference) {
        return sendError(res, 400, 'Transaction reference is required');
      }
      if (!amount && amount !== 0) {
        return sendError(res, 400, 'Amount is required');
      }
      if (!email) {
        return sendError(res, 400, 'Email is required');
      }
      // The client-supplied per-book numbers must reconcile to the charge.
      if (Math.abs(netCharged - round2(amount)) > 0.01) {
        return sendError(res, 400, 'Cart total mismatch', {
          expected: round2(amount),
          got: netCharged
        });
      }

      // A coupon can cover PART of a real payment. Validate it server-side and
      // record it, otherwise the discount would be honoured with no coupon
      // validation and its usage would never be counted. The charged total was
      // already reconciled to Paystack above, so this cannot undercharge.
      if (couponCode && String(couponCode).trim()) {
        const found = await lookupCoupon(couponCode);
        const eligible = items.filter((i) => couponScopeMatches(found, i));
        if (!eligible.length) {
          return sendError(res, 400, "This coupon doesn't apply to any books in the cart.");
        }
        coupon = found;
      } else if (totalDiscount > 0.005) {
        // A discount was claimed with no coupon code at all.
        return sendError(res, 400, 'A discount was applied without a valid coupon code.');
      }

      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      if (!PAYSTACK_SECRET_KEY) {
        console.error('PAYSTACK_SECRET_KEY not found in environment');
        return sendError(res, 500, 'Payment service not configured - missing secret key');
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Paystack error:', errorText);
        return sendError(res, 400, 'Transaction verification failed');
      }
      const data = await response.json();
      transaction = data.data;
      if (transaction.status !== 'success') {
        return sendError(res, 400, `Transaction not successful. Status: ${transaction.status}`);
      }
      const expectedAmount = Math.round(round2(amount) * 100);
      if (transaction.amount !== expectedAmount) {
        return sendError(res, 400, 'Amount mismatch', {
          expected: amount,
          actual: transaction.amount / 100
        });
      }
      if (transaction.customer?.email && transaction.customer.email.toLowerCase() !== String(email).toLowerCase()) {
        return sendError(res, 400, 'Email mismatch');
      }
      if (transaction.customer?.email) {
        customerEmail = transaction.customer.email;
      }
    }

    // ===== WRITE PURCHASES (server-authoritative) =====
    const chargedTotalGHS = isCouponMode ? 0 : round2(amount);
    const written = [];
    // A repurchase resets the download allowance, matching the old client
    // behaviour, and every field is server-derived (never client-supplied).
    const buildFields = (item) => {
      const meta = books[item.bookId];
      const perBookAmount = round2(Math.max(0, item.priceInGHS - item.discountGHS));
      return {
        status: 'completed',
        verified: true,
        verifiedBy: 'serverless-api',
        platform: 'reads',
        purchasedAt: serverTimestamp(),
        transactionRef: reference,
        amount: perBookAmount,
        currency: 'GHS',
        customerEmail: customerEmail,
        paymentMethod: isCouponMode ? 'coupon' : 'paystack',
        downloadCount: 0,
        lastDownloadedAt: null,
        authorId: meta.authorId,
        bookTitle: meta.bookTitle,
        preorder: meta.preorder,
        preorderReleaseDate: meta.preorderReleaseDate,
        released: meta.released,
        releasedAt: null,
        authorSettled: true,
        settlementStatus: 'pending',
        settlementDate: nextSettlementDate(),
        couponCode: coupon ? (coupon.code || couponCode) : null,
        discountGHS: item.discountGHS,
        chargedTotalGHS: chargedTotalGHS
      };
    };

    // Claim the coupon and write every purchase in ONE transaction. Doing the
    // "is it still live?" check and the uses increment separately let two
    // simultaneous checkouts both pass the maxUses check and overshoot the
    // limit. Re-checking inside the transaction makes the claim atomic.
    await firestore.runTransaction(async (tx) => {
      let couponDoc = null;
      if (coupon && coupon.id) {
        couponDoc = await tx.get(firestore.collection('coupons').doc(coupon.id));
        if (!couponDoc.exists) {
          const err = new Error('This coupon no longer exists.');
          err.status = 400;
          throw err;
        }
        if (!couponIsLive(couponDoc.data() || {})) {
          const err = new Error('This coupon is invalid, expired, or has reached its usage limit.');
          err.status = 400;
          throw err;
        }
      }

      for (const item of items) {
        const ref = firestore.collection('purchases').doc(`${uid}_${item.bookId}`);
        const fields = buildFields(item);
        const existing = await tx.get(ref);
        if (existing.exists) {
          tx.update(ref, Object.assign({}, fields, { purchaseCount: increment(1) }));
        } else {
          tx.set(
            ref,
            Object.assign(
              {
                userId: uid,
                bookId: item.bookId,
                purchaseCount: 1
              },
              fields
            )
          );
        }
        written.push(item.bookId);
      }

      // Coupon usage is counted here so it is part of the same atomic commit.
      if (coupon && coupon.id) {
        tx.update(firestore.collection('coupons').doc(coupon.id), {
          uses: increment(1),
          lastUsedAt: serverTimestamp()
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: isCouponMode ? 'Coupon applied' : 'Transaction verified successfully',
      recorded: written,
      data: transaction
        ? {
            reference: transaction.reference,
            amount: transaction.amount / 100,
            currency: transaction.currency,
            customer: transaction.customer,
            paidAt: transaction.paidAt
          }
        : { reference, amount: 0, currency: 'GHS', customer: { email: customerEmail } }
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Verification error:', error);
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Internal server error' : error.message,
      error: error.message
    });
  }
};
