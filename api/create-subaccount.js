// ============================================================
// FILE: api/create-subaccount.js (FIXED FOR MOMO)
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// ============================================================

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

        if (!payoutData.type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing payout type (bank or momo)' 
            });
        }

        // Get Paystack Secret Key from environment
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        
        if (!PAYSTACK_SECRET_KEY) {
            console.error('❌ PAYSTACK_SECRET_KEY not set in environment');
            return res.status(500).json({ 
                success: false, 
                message: 'Paystack secret key not configured.' 
            });
        }

        console.log('✅ Paystack secret key found');

        const businessName = username || 'Volant Author';
        const commissionRate = 10;

        // ============================================================
        // ===== BUILD PAYLOAD BASED ON PAYOUT TYPE =====
        // ============================================================
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

        // ===== BANK ACCOUNT =====
        if (payoutData.type === 'bank') {
            // Validate bank fields
            if (!payoutData.accountNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Account number is required for bank payout'
                });
            }
            if (!payoutData.bankCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Bank code is required for bank payout'
                });
            }
            if (!payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'Account holder name is required for bank payout'
                });
            }

            payload.bank_code = payoutData.bankCode;
            payload.account_number = payoutData.accountNumber;
            payload.account_name = payoutData.accountHolderName;
            
            console.log('🏦 Creating bank subaccount for:', businessName);
        }

        // ===== MOBILE MONEY =====
        else if (payoutData.type === 'momo') {
            // Validate MoMo fields
            if (!payoutData.phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is required for Mobile Money payout'
                });
            }
            if (!payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'Account holder name is required for Mobile Money payout'
                });
            }

            // Format phone number for Paystack (international format)
            let phone = payoutData.phoneNumber.replace(/\s/g, '');
            
            // Remove any leading + if present
            if (phone.startsWith('+')) {
                phone = phone.substring(1);
            }
            
            // Convert to international format
            if (phone.startsWith('0')) {
                phone = '233' + phone.substring(1);
            }
            if (!phone.startsWith('233')) {
                phone = '233' + phone;
            }

            // Paystack expects the phone number without the country code prefix in some cases
            // But for MoMo subaccounts, they use the phone field
            payload.phone = phone;
            payload.account_name = payoutData.accountHolderName;
            payload.metadata.network = payoutData.network || 'mtn';
            
            console.log('📱 Creating MoMo subaccount for:', businessName);
            console.log('📱 Phone:', phone);
            console.log('📱 Network:', payoutData.network);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
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
            // Provide more specific error messages
            let errorMessage = data.message || 'Failed to create subaccount';
            
            // Common Paystack errors
            if (data.message && data.message.includes('phone')) {
                errorMessage = 'Invalid phone number format. Please use a valid Ghanaian number.';
            } else if (data.message && data.message.includes('account')) {
                errorMessage = 'Invalid account details. Please check your information.';
            } else if (data.message && data.message.includes('bank')) {
                errorMessage = 'Invalid bank details. Please check your bank information.';
            }
            
            return res.status(400).json({
                success: false,
                message: errorMessage,
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