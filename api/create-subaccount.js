// ============================================================
// FILE: api/create-subaccount.js (FULLY FIXED FOR MOMO)
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// ============================================================

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight (OPTIONS) request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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

        // ===== VALIDATE REQUIRED FIELDS =====
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

        // ===== GET PAYSTACK SECRET KEY =====
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

        // ============================================================
        // ===== BANK ACCOUNT =====
        // ============================================================
        if (payoutData.type === 'bank') {
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

        // ============================================================
        // ===== MOBILE MONEY - FIXED =====
        // ============================================================
        else if (payoutData.type === 'momo') {
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
            
            if (phone.startsWith('+')) {
                phone = phone.substring(1);
            }
            
            if (phone.startsWith('0')) {
                phone = '233' + phone.substring(1);
            }
            if (!phone.startsWith('233')) {
                phone = '233' + phone;
            }

            // ===== CRITICAL FIX: Paystack requires BOTH phone AND account_name =====
            payload.phone = phone;
            payload.account_name = payoutData.accountHolderName;  // 👈 REQUIRED FOR MOMO!
            
            // Add network to metadata
            payload.metadata.network = payoutData.network || 'mtn';
            
            console.log('📱 Creating MoMo subaccount for:', businessName);
            console.log('📱 Phone (formatted):', phone);
            console.log('📱 Account holder:', payoutData.accountHolderName);
            console.log('📱 Network:', payoutData.network);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
        }

        console.log('📤 Sending to Paystack:', JSON.stringify(payload, null, 2));

        // ===== MAKE REQUEST TO PAYSTACK =====
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

        // ===== HANDLE PAYSTACK ERRORS =====
        if (!data.status) {
            let errorMessage = data.message || 'Failed to create subaccount';
            
            // Provide user-friendly error messages
            if (data.message) {
                const msg = data.message.toLowerCase();
                if (msg.includes('phone') || msg.includes('invalid phone')) {
                    errorMessage = 'Invalid phone number format. Please use a valid Ghanaian number (e.g., 024XXXXXXX).';
                } else if (msg.includes('account name') || msg.includes('account_name')) {
                    errorMessage = 'Account holder name is required. Please enter the name on your MoMo account.';
                } else if (msg.includes('account') || msg.includes('invalid account')) {
                    errorMessage = 'Invalid account details. Please check your information and try again.';
                } else if (msg.includes('bank') || msg.includes('invalid bank')) {
                    errorMessage = 'Invalid bank details. Please check your bank information.';
                } else if (msg.includes('duplicate') || msg.includes('already exists')) {
                    errorMessage = 'This payout account has already been registered.';
                } else if (msg.includes('permission') || msg.includes('authorization')) {
                    errorMessage = 'Paystack authorization error. Please check your API keys.';
                }
            }
            
            return res.status(400).json({
                success: false,
                message: errorMessage,
                details: data
            });
        }

        // ============================================================
        // ===== SUCCESS =====
        // ============================================================
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
