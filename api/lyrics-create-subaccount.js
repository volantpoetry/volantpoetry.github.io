// ============================================================
// FILE: api/lyrics-create-subaccount.js
// ============================================================
// Vercel Serverless Function - Create Paystack subaccount for a
// Volant Lyrics songwriter.
// Uses the Volant Lyrics Paystack business secret key ONLY, so
// lyricist payouts settle under the Volant Lyrics business.
// (Volant Reads uses api/create-subaccount.js.)
// ============================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed. Use POST.'
        });
    }

    try {
        const { userId, email, payoutData, username } = req.body;

        if (!userId || !email || !payoutData) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (!payoutData.type) {
            return res.status(400).json({
                success: false,
                message: 'Missing payout type'
            });
        }

        const LYRICS_PAYSTACK_SECRET_KEY = process.env.LYRICS_PAYSTACK_SECRET_KEY;
        if (!LYRICS_PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                success: false,
                message: 'Paystack secret key not configured for Volant Lyrics'
            });
        }

        const businessName = username || 'Volant Songwriter';
        const commissionRate = 10;

        let settlementBank = '';
        let accountNumber = '';

        // ===== BANK ACCOUNT =====
        if (payoutData.type === 'bank') {
            if (!payoutData.accountNumber || !payoutData.bankCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Bank account number and bank code are required'
                });
            }
            settlementBank = payoutData.bankCode;
            accountNumber = payoutData.accountNumber;
        }

        // ===== MOBILE MONEY =====
        else if (payoutData.type === 'momo') {
            if (!payoutData.phoneNumber || !payoutData.network) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number and network provider are required for MoMo'
                });
            }

            let cleanPhone = payoutData.phoneNumber.replace(/\s/g, '');
            if (cleanPhone.startsWith('+233')) {
                cleanPhone = '0' + cleanPhone.substring(4);
            } else if (cleanPhone.startsWith('233')) {
                cleanPhone = '0' + cleanPhone.substring(3);
            } else if (!cleanPhone.startsWith('0')) {
                cleanPhone = '0' + cleanPhone;
            }

            const networkMap = {
                'mtn': 'MTN',
                'vodafone': 'VOD',
                'tigo': 'ATL'
            };
            settlementBank = networkMap[payoutData.network] || 'MTN';
            accountNumber = cleanPhone;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
        }

        const payload = {
            business_name: businessName,
            percentage_charge: commissionRate,
            bearer: 'account',
            settlement_schedule: 'auto',
            primary_contact_email: email,
            settlement_bank: settlementBank,
            account_number: accountNumber,
            metadata: {
                userId: userId,
                platform: 'volant-lyrics',
                payoutType: payoutData.type
            }
        };

        const response = await fetch('https://api.paystack.co/subaccount', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${LYRICS_PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.status) {
            let errorMessage = data.message || 'Failed to create subaccount';
            if (data.message && data.message.toLowerCase().includes('number')) {
                errorMessage = 'Invalid account or phone number format. Please check your details.';
            } else if (data.message && data.message.toLowerCase().includes('duplicate')) {
                errorMessage = 'This settlement account has already been registered.';
            } else if (data.message && data.message.toLowerCase().includes('bank')) {
                errorMessage = 'Invalid bank code or network provider. Please check your selection.';
            }

            return res.status(400).json({
                success: false,
                message: errorMessage,
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            subaccountCode: data.data.subaccount_code,
            subaccountId: data.data.id,
            message: 'Lyrics subaccount created successfully'
        });

    } catch (error) {
        console.error('😿 Lyrics subaccount server error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};