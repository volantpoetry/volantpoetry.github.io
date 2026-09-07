// ============================================================
// FILE: api/create-subaccount.js
// ============================================================
// Vercel Serverless Function - Create Paystack Subaccount
// Based on Paystack API documentation
// ============================================================

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS (CORS preflight)
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
        console.log('📥 Received:', JSON.stringify(body, null, 2));

        const { userId, email, payoutData, username } = body;

        // Validate basic layout
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

        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ 
                success: false, 
                message: 'Paystack secret key not configured' 
            });
        }

        const businessName = username || 'Volant Author';
        const commissionRate = 10;

        let settlementBank = '';
        let accountNumber = '';

        // ============================================================
        // ===== PROCESS BANK ACCOUNT =====
        // ============================================================
        if (payoutData.type === 'bank') {
            if (!payoutData.accountNumber || !payoutData.bankCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Bank account number and bank code are required'
                });
            }
            // ✅ Use settlement_bank (NOT bank_code)
            settlementBank = payoutData.bankCode;
            accountNumber = payoutData.accountNumber;
        }

        // ============================================================
        // ===== PROCESS MOBILE MONEY =====
        // ============================================================
        else if (payoutData.type === 'momo') {
            if (!payoutData.phoneNumber || !payoutData.network) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number and network provider are required for MoMo'
                });
            }

            // ✅ Format phone number for Paystack
            // Paystack expects standard local format like '024XXXXXXX'
            let cleanPhone = payoutData.phoneNumber.replace(/\s/g, '');
            
            // Remove +233 and add 0
            if (cleanPhone.startsWith('+233')) {
                cleanPhone = '0' + cleanPhone.substring(4);
            } else if (cleanPhone.startsWith('233')) {
                cleanPhone = '0' + cleanPhone.substring(3);
            } else if (!cleanPhone.startsWith('0')) {
                cleanPhone = '0' + cleanPhone;
            }

            // ✅ Paystack maps telecom codes via settlement_bank
            // MTN, VOD (Vodafone), ATL (AirtelTigo)
            const networkMap = {
                'mtn': 'MTN',
                'vodafone': 'VOD',
                'tigo': 'ATL'
            };
            settlementBank = networkMap[payoutData.network] || 'MTN';
            accountNumber = cleanPhone;
            
            console.log('📱 MoMo formatted:', {
                network: settlementBank,
                phone: accountNumber
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payout type. Must be "bank" or "momo"'
            });
        }

        // ============================================================
        // ===== BUILD UNIFIED PAYSTACK PAYLOAD =====
        // ============================================================
        // ✅ Paystack always expects settlement_bank and account_number
        const payload = {
            business_name: businessName,
            percentage_charge: commissionRate,
            bearer: 'account',
            settlement_schedule: 'auto',
            primary_contact_email: email,
            settlement_bank: settlementBank,  // ✅ ALWAYS settlement_bank
            account_number: accountNumber,    // ✅ ALWAYS account_number
            metadata: {
                userId: userId,
                platform: 'volant-reads',
                payoutType: payoutData.type
            }
        };

        console.log('🚀 Sending to Paystack:', JSON.stringify(payload, null, 2));

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
            message: 'Subaccount created successfully'
        });

    } catch (error) {
        console.error('❌ Server error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};