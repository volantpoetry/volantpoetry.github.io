// ============================================================
// FILE: api/create-subaccount.js
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// ============================================================

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.warn('⚠️ PAYSTACK_SECRET_KEY not set in environment variables');
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { userId, email, payoutData, username } = req.body;

        if (!userId || !email) {
            return res.status(400).json({ success: false, message: 'Missing required fields: userId, email' });
        }

        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, message: 'Paystack secret key not configured' });
        }

        const businessName = username || 'Volant Author';
        const commissionRate = 10; // 10% platform commission

        // Build payload for Paystack subaccount creation
        let payload = {
            business_name: businessName,
            percentage_charge: commissionRate,
            bearer: 'account',
            settlement_schedule: 'auto',
            primary_contact_email: email,
            metadata: {
                userId: userId,
                platform: 'volant-reads',
                payoutType: payoutData.type
            }
        };

        // Add bank or MoMo details
        if (payoutData.type === 'bank') {
            // For bank, we need bank_code and account_number
            // You'll need to implement bank code lookup or accept bank code from user
            // For simplicity, we'll use a placeholder - you should implement proper bank selection
            payload.bank_code = payoutData.bankCode || '058'; // Example: '058' is GCB Bank
            payload.account_number = payoutData.accountNumber;
            payload.account_name = payoutData.accountHolderName;
        } else if (payoutData.type === 'momo') {
            // For MoMo, Paystack requires phone number
            // The network is inferred from the phone number prefix
            let phone = payoutData.phoneNumber;
            // Ensure phone number is in international format
            if (phone.startsWith('0')) {
                phone = '233' + phone.substring(1);
            }
            if (!phone.startsWith('233')) {
                phone = '233' + phone;
            }
            payload.phone = phone;
            payload.account_name = payoutData.accountHolderName;
            // Paystack will automatically detect the network from the phone number
        }

        console.log('📤 Creating subaccount for:', businessName);

        const response = await fetch('https://api.paystack.co/subaccount', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 Paystack response:', data);

        if (!data.status) {
            return res.status(400).json({
                success: false,
                message: data.message || 'Failed to create subaccount'
            });
        }

        return res.status(200).json({
            success: true,
            subaccountCode: data.data.subaccount_code,
            subaccountId: data.data.id,
            message: 'Subaccount created successfully'
        });

    } catch (error) {
        console.error('❌ Error creating subaccount:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};