// ============================================================
// FILE: api/create-subaccount.js (MOMO FIXED)
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
        const body = req.body;
        console.log('📥 Received:', JSON.stringify(body, null, 2));

        const { userId, email, payoutData, username } = body;

        // Validate
        if (!userId || !email || !payoutData) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ 
                success: false, 
                message: 'Paystack secret key not configured' 
            });
        }

        const businessName = username || 'Volant Author';
        const commissionRate = 10;

        // ============================================================
        // ===== BUILD PAYLOAD =====
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

        // ============================================================
        // ===== BANK ACCOUNT =====
        // ============================================================
        if (payoutData.type === 'bank') {
            if (!payoutData.accountNumber || !payoutData.bankCode || !payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'All bank fields are required'
                });
            }

            payload.bank_code = payoutData.bankCode;
            payload.account_number = payoutData.accountNumber;
            payload.account_name = payoutData.accountHolderName;
            
            console.log('🏦 Bank payload sent to Paystack');
        }

        // ============================================================
        // ===== MOBILE MONEY - FIXED =====
        // ============================================================
        else if (payoutData.type === 'momo') {
            if (!payoutData.phoneNumber || !payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number and account holder name are required for MoMo'
                });
            }

            // ===== IMPORTANT: Phone number formatting =====
            let phone = payoutData.phoneNumber.replace(/\s/g, '');
            
            // Paystack expects the phone WITHOUT the 0 prefix
            // Example: 0599610045 -> 599610045
            if (phone.startsWith('0')) {
                phone = phone.substring(1);
            }
            
            // ALSO remove any country code if present
            if (phone.startsWith('233')) {
                phone = phone.substring(3);
            }
            
            // If phone starts with +, remove it
            if (phone.startsWith('+')) {
                phone = phone.substring(1);
            }

            // ===== CRITICAL: Paystack MoMo payload =====
            payload.phone = phone;  // Just the number, no country code
            payload.account_name = payoutData.accountHolderName;
            payload.metadata.network = payoutData.network || 'mtn';
            
            console.log('📱 MoMo payload sent to Paystack:');
            console.log('  Phone:', phone);
            console.log('  Account Name:', payoutData.accountHolderName);
            console.log('  Network:', payoutData.network);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
        }

        // ============================================================
        // ===== SEND TO PAYSTACK =====
        // ============================================================
        console.log('📤 Full Paystack payload:', JSON.stringify(payload, null, 2));

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

        // ============================================================
        // ===== HANDLE RESPONSE =====
        // ============================================================
        if (!data.status) {
            let errorMessage = data.message || 'Failed to create subaccount';
            
            // Specific error messages
            if (data.message && data.message.includes('phone')) {
                errorMessage = 'Invalid phone number format. Please use a valid Ghanaian number (e.g., 024XXXXXXX).';
            } else if (data.message && data.message.includes('account_name')) {
                errorMessage = 'Account holder name is required and must match the MoMo account.';
            } else if (data.message && data.message.includes('duplicate')) {
                errorMessage = 'This payout account has already been registered.';
            } else if (data.message && data.message.includes('bearer')) {
                errorMessage = 'Invalid fee bearer setting. Please contact support.';
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
            message: 'Subaccount created successfully'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};
