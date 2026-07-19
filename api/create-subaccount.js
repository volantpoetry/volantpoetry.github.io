// ============================================================
// FILE: api/create-subaccount.js
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// ============================================================

// Allow CORS for all origins
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
};

module.exports = async (req, res) => {
    // Handle preflight (OPTIONS) request
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(200).end();
        return;
    }

    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            message: 'Method not allowed. Use POST.' 
        });
    }

    try {
        // Parse request body
        const body = req.body;
        console.log('📥 Received request:', JSON.stringify(body, null, 2));

        const { userId, email, payoutData, username } = body;

        // Validate required fields
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required field: userId' 
            });
        }

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required field: email' 
            });
        }

        if (!payoutData) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required field: payoutData' 
            });
        }

        // Get Paystack Secret Key from environment
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        
        if (!PAYSTACK_SECRET_KEY) {
            console.error('❌ PAYSTACK_SECRET_KEY not set in environment');
            return res.status(500).json({ 
                success: false, 
                message: 'Paystack secret key not configured. Please add PAYSTACK_SECRET_KEY to environment variables.' 
            });
        }

        console.log('✅ Paystack secret key found');

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
            // For Ghana, you need to use the correct bank code
            // This is a simplified version - you should implement proper bank selection
            const bankCode = payoutData.bankCode || '058'; // '058' is GCB Bank in Ghana
            payload.bank_code = bankCode;
            payload.account_number = payoutData.accountNumber;
            payload.account_name = payoutData.accountHolderName;
        } else if (payoutData.type === 'momo') {
            // For MoMo, Paystack requires phone number
            let phone = payoutData.phoneNumber;
            // Ensure phone number is in international format
            if (phone) {
                phone = phone.replace(/\s/g, '');
                if (phone.startsWith('0')) {
                    phone = '233' + phone.substring(1);
                }
                if (!phone.startsWith('233')) {
                    phone = '233' + phone;
                }
                payload.phone = phone;
            }
            payload.account_name = payoutData.accountHolderName;
        }

        console.log('📤 Sending to Paystack:', JSON.stringify(payload, null, 2));

        // Make request to Paystack
        const response = await fetch('https://api.paystack.co/subaccount', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 Paystack response:', JSON.stringify(data, null, 2));

        if (!data.status) {
            return res.status(400).json({
                success: false,
                message: data.message || 'Failed to create subaccount',
                paystackError: data
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