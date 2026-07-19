// ============================================================
// FILE: api/create-subaccount.js - FINAL FIXED VERSION
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// ============================================================

module.exports = async (req, res) => {
    // ===== SET CORS HEADERS =====
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // ===== HANDLE OPTIONS (CORS Preflight) =====
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS request handled');
        return res.status(200).end();
    }

    // ===== ONLY ALLOW POST =====
    if (req.method !== 'POST') {
        console.log('❌ Method not allowed:', req.method);
        return res.status(405).json({ 
            success: false, 
            message: 'Method not allowed. Use POST.' 
        });
    }

    console.log('📥 POST request received');

    try {
        // ===== PARSE BODY =====
        let body;
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (e) {
            body = req.body;
        }
        
        console.log('📥 Request body:', JSON.stringify(body, null, 2));

        const { userId, email, payoutData, username } = body;

        // ===== VALIDATE REQUIRED FIELDS =====
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing userId' 
            });
        }

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing email' 
            });
        }

        if (!payoutData) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing payoutData' 
            });
        }

        if (!payoutData.type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing payout type (bank or momo)' 
            });
        }

        // ===== GET PAYSTACK KEY =====
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        
        if (!PAYSTACK_SECRET_KEY) {
            console.error('❌ PAYSTACK_SECRET_KEY not set');
            return res.status(500).json({ 
                success: false, 
                message: 'Paystack secret key not configured' 
            });
        }

        console.log('✅ Paystack secret key found');

        const businessName = username || 'Volant Author';
        const commissionRate = 10;

        // ============================================================
        // ===== BANK ACCOUNT =====
        // ============================================================
        if (payoutData.type === 'bank') {
            console.log('🏦 Processing BANK payout');
            
            // Only check bank fields for bank
            if (!payoutData.accountNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Account number required for bank'
                });
            }
            if (!payoutData.bankCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Bank code required'
                });
            }
            if (!payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'Account holder name required'
                });
            }

            // Build bank payload
            let bankPayload = {
                business_name: businessName,
                percentage_charge: commissionRate,
                bearer: 'account',
                settlement_schedule: 'auto',
                primary_contact_email: email,
                bank_code: payoutData.bankCode,
                account_number: payoutData.accountNumber,
                account_name: payoutData.accountHolderName,
                metadata: {
                    userId: userId,
                    platform: 'volant-reads',
                    payoutType: payoutData.type
                }
            };
            
            console.log('📤 Sending bank payload:', JSON.stringify(bankPayload, null, 2));
            
            const response = await fetch('https://api.paystack.co/subaccount', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bankPayload)
            });

            const data = await response.json();
            console.log('📥 Paystack response:', JSON.stringify(data, null, 2));

            if (!data.status) {
                return res.status(400).json({
                    success: false,
                    message: data.message || 'Failed to create bank subaccount',
                    details: data
                });
            }

            return res.status(200).json({
                success: true,
                subaccountCode: data.data.subaccount_code,
                subaccountId: data.data.id,
                message: 'Bank subaccount created successfully'
            });
        }

        // ============================================================
        // ===== MOBILE MONEY - NO ACCOUNT NUMBER CHECK! =====
        // ============================================================
        else if (payoutData.type === 'momo') {
            console.log('📱 Processing MOMO payout');
            
            // ✅ ONLY check MoMo fields - NO accountNumber!
            if (!payoutData.phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number required for MoMo'
                });
            }
            if (!payoutData.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    message: 'Account holder name required for MoMo'
                });
            }

            // Format phone number for Paystack
            let phone = payoutData.phoneNumber.replace(/\s/g, '');
            
            // Remove leading +
            if (phone.startsWith('+')) {
                phone = phone.substring(1);
            }
            
            // Remove leading 0 (Ghana format)
            if (phone.startsWith('0')) {
                phone = phone.substring(1);
            }
            
            // Remove country code if present
            if (phone.startsWith('233')) {
                phone = phone.substring(3);
            }

            // ===== KEY: MoMo uses 'phone' NOT 'account_number' =====
            let momoPayload = {
                business_name: businessName,
                percentage_charge: commissionRate,
                bearer: 'account',
                settlement_schedule: 'auto',
                primary_contact_email: email,
                phone: phone,  // ✅ NO account_number!
                account_name: payoutData.accountHolderName,
                metadata: {
                    userId: userId,
                    platform: 'volant-reads',
                    payoutType: payoutData.type,
                    network: payoutData.network || 'mtn'
                }
            };
            
            console.log('📱 Sending MoMo payload:', JSON.stringify(momoPayload, null, 2));
            console.log('📱 Phone (formatted):', phone);
            console.log('📱 Account name:', payoutData.accountHolderName);
            console.log('📱 Network:', payoutData.network);
            
            const response = await fetch('https://api.paystack.co/subaccount', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(momoPayload)
            });

            const data = await response.json();
            console.log('📥 Paystack response:', JSON.stringify(data, null, 2));

            if (!data.status) {
                let errorMessage = data.message || 'Failed to create MoMo subaccount';
                
                // Specific error messages
                if (data.message && data.message.toLowerCase().includes('phone')) {
                    errorMessage = 'Invalid phone number format. Please use a valid Ghanaian number (e.g., 024XXXXXXX).';
                } else if (data.message && data.message.toLowerCase().includes('account_name')) {
                    errorMessage = 'Account holder name is required. Please enter the name on your MoMo account.';
                } else if (data.message && data.message.toLowerCase().includes('duplicate')) {
                    errorMessage = 'This payout account has already been registered.';
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
                message: 'MoMo subaccount created successfully'
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
        }

    } catch (error) {
        console.error('❌ Server error:', error.message);
        console.error('❌ Stack:', error.stack);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};
