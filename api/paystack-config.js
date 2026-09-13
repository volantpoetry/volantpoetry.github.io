// ============================================================
// FILE: api/paystack-config.js
// ============================================================
// Vercel Serverless Function - Volant Reads / Volant Poetry
// Paystack settings. Serves ONLY the PUBLIC key (+ safe config).
// The secret key never leaves the server.
// ============================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed. Use GET.' });
    }

    const publicKey = process.env.PAYSTACK_PUBLIC_KEY || '';
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';

    return res.status(200).json({
        success: !!publicKey,
        publicKey: publicKey,
        mode: secretKey.startsWith('sk_test_') ? 'test' : 'live',
        commissionRate: Number(process.env.PAYSTACK_COMMISSION) || 10,
        feeBearer: process.env.PAYSTACK_FEE_BEARER || 'account'
    });
};