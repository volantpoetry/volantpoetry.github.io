// ============================================================
// FILE: api/lyrics-verify-transaction.js
// ============================================================
// Vercel Serverless Function - Verify a Volant Lyrics purchase
// Uses the Volant Lyrics Paystack business secret key ONLY.
// (Volant Reads uses api/verify-paystack-transaction.js.)
// ============================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
    }

    try {
        const { reference, amount, email, itemId } = req.body;

        if (!reference) {
            return res.status(400).json({ success: false, message: 'Transaction reference is required' });
        }
        if (!amount && amount !== 0) {
            return res.status(400).json({ success: false, message: 'Amount is required' });
        }
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const LYRICS_PAYSTACK_SECRET_KEY = process.env.LYRICS_PAYSTACK_SECRET_KEY;
        if (!LYRICS_PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, message: 'Payment service not configured for Volant Lyrics - missing secret key' });
        }

        const response = await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
            {
                headers: {
                    'Authorization': `Bearer ${LYRICS_PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            return res.status(400).json({
                success: false,
                message: 'Transaction verification failed',
                details: await response.text()
            });
        }

        const data = await response.json();
        const transaction = data.data;

        if (transaction.status !== 'success') {
            return res.status(400).json({
                success: false,
                message: `Transaction not successful. Status: ${transaction.status}`
            });
        }

        const expectedAmount = Math.round(amount * 100);
        if (transaction.amount !== expectedAmount) {
            return res.status(400).json({
                success: false,
                message: 'Amount mismatch',
                details: {
                    expected: amount,
                    actual: transaction.amount / 100
                }
            });
        }

        if (transaction.customer?.email &&
            transaction.customer.email.toLowerCase() !== email.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: 'Email mismatch'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Transaction verified successfully',
            data: {
                reference: transaction.reference,
                amount: transaction.amount / 100,
                currency: transaction.currency,
                customer: transaction.customer,
                itemId: itemId || null,
                paidAt: transaction.paidAt
            }
        });

    } catch (error) {
        console.error('😿 Lyrics verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};