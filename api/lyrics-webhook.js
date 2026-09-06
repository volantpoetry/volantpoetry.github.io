// ============================================================
// FILE: api/lyrics-webhook.js
// ============================================================
// Vercel Serverless Function - Paystack webhook for Volant Lyrics.
// Verifies signatures with the Volant Lyrics Paystack secret key,
// so events from the Lyrics business never collide with Volant Reads.
// ============================================================
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const signature = req.headers['x-paystack-signature'];
        const lyricsSecret = process.env.LYRICS_PAYSTACK_SECRET_KEY;

        if (!signature || !lyricsSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const hash = crypto
            .createHmac('sha512', lyricsSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== signature) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = req.body;
        console.log(`Lyrics webhook: ${event.event}`);

        // Future: verify charge.success here and award lyric ownership
        // e.g. update the buyer's purchases collection via firebase-admin.

        return res.status(200).json({ status: 'success' });

    } catch (error) {
        console.error('Lyrics webhook error:', error);
        return res.status(200).json({ status: 'error' });
    }
}