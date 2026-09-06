// ============================================================
// FILE: api/mall-webhook.js
// ============================================================
// Vercel Serverless Function - Paystack webhook for Volant Mall.
// Verifies signatures with the Volant Mall Paystack secret key,
// so events from the Mall business never collide with Volant
// Reads or Volant Lyrics. Also confirms a charge was successful
// before an order is marked as paid.
// ============================================================
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const signature = req.headers['x-paystack-signature'];
        const mallSecret = process.env.MALL_PAYSTACK_SECRET_KEY;

        if (!signature || !mallSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const hash = crypto
            .createHmac('sha512', mallSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== signature) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = req.body;
        console.log(`Mall webhook: ${event.event}`);

        if (event.event === 'charge.success') {
            const txn = event.data;
            console.log(`Mall payment successful: ${txn.reference} (${txn.amount / 100} ${txn.currency})`);
            // Future: mark the matching mall-orders document as paid here
            // via firebase-admin, using txn.reference as the order ref.
        }

        return res.status(200).json({ status: 'success' });

    } catch (error) {
        console.error('Mall webhook error:', error);
        return res.status(200).json({ status: 'error' });
    }
}