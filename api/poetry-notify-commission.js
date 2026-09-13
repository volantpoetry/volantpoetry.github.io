// ============================================================
// FILE: api/poetry-notify-commission.js (volantpoetry.vercel.app)
// ============================================================
// Best-effort emails for a sold custom/dedication poem order:
//   1. Notifies the poet a buyer has paid them to write a poem.
//   2. Sends the buyer an order confirmation.
// Degrades gracefully if RESEND_API_KEY is unset — the order is
// already saved to Firestore (by the client) and shown to the
// poet's inbox. Reuses the lyrics commission-requests collection.
// ============================================================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const { to, toName, fromName, fromEmail, recipient, occasion, length, amount, details, requestId } = body;

        if (!toName) {
            return res.status(400).json({ ok: false, error: 'Missing poet name' });
        }
        if (!/:/.test(String(to || ''))) {
            return res.status(400).json({ ok: false, error: 'Missing poet email' });
        }

        const key = process.env.RESEND_API_KEY;
        const from = process.env.MAIL_FROM || 'Volant Poetry <no-reply@resend.dev>';
        if (!key) {
            return res.status(200).json({ ok: true, sent: 0, skipped: 1, note: 'RESEND_API_KEY not set; in-app notification only' });
        }

        const poetSubject = `✍️ You have a paid custom-poem order from ${fromName}`;
        const poetHtml = `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf9fe;border-radius:12px;">
                <h2 style="color:#4b2aad;margin-top:0;">New custom poem order — paid 🎉</h2>
                <p style="color:#555;font-size:16px;">Hi <strong>${toName}</strong>, a buyer has paid GHS ${Number(amount) || 0} for a personal poem.</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Buyer</td><td style="padding:8px 10px;color:#555;">${fromName || 'Anonymous buyer'}</td></tr>
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Buyer email</td><td style="padding:8px 10px;color:#555;">${fromEmail || 'Not provided'}</td></tr>
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Dedication to</td><td style="padding:8px 10px;color:#555;">${recipient || '—'}</td></tr>
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Occasion</td><td style="padding:8px 10px;color:#555;">${occasion || '—'}</td></tr>
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Length</td><td style="padding:8px 10px;color:#555;">${length || '—'}</td></tr>
                    <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Amount</td><td style="padding:8px 10px;color:#555;">GHS ${Number(amount) || 0}</td></tr>
                </table>
                <div style="background:#f0edff;border:1px solid #e2daf5;border-radius:10px;padding:14px;color:#4a4458;white-space:pre-wrap;">${String(details || '').slice(0, 3000)}</div>
                <p style="margin-top:24px;color:#8a8a8a;font-size:13px;">Write the poem, then send it to <strong>${fromEmail || 'the buyer'}</strong> to complete the order. You keep ${100 - (Number(process.env.PAYSTACK_COMMISSION) || 10)}% of the payment (a ${Number(process.env.PAYSTACK_COMMISSION) || 10}% platform commission applies).</p>
            </div>
        `;

        const sentList = [];
        const send = async (toAddr, subject, html) => {
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ from, to: toAddr, subject, html })
            });
            if (r.ok) sentList.push(toAddr);
            else console.error('Resend error for', toAddr, r.status, await r.text().catch(() => ''));
        };

        if (to && /:/.test(to)) await send(to, poetSubject, poetHtml);

        if (fromEmail && /:/.test(fromEmail)) {
            const buyerHtml = `
                <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf9fe;border-radius:12px;">
                    <h2 style="color:#4b2aad;margin-top:0;">Your custom poem order is confirmed ✅</h2>
                    <p style="color:#555;font-size:16px;">Hi <strong>${fromName || 'there'}</strong>, your payment of GHS ${Number(amount) || 0} for a custom poem by <strong>${toName}</strong> was successful.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                        <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Dedication to</td><td style="padding:8px 10px;color:#555;">${recipient || '—'}</td></tr>
                        <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Occasion</td><td style="padding:8px 10px;color:#555;">${occasion || '—'}</td></tr>
                        <tr><td style="padding:8px 10px;font-weight:700;color:#1a1a2e;">Order ID</td><td style="padding:8px 10px;color:#555;">${requestId || '—'}</td></tr>
                    </table>
                    <p style="color:#555;font-size:15px;line-height:1.6;">${toName} will write and deliver your poem to this email. Usually within 2–4 days. You can reply to this confirmation to send ${toName} extra notes.</p>
                </div>
            `;
            await send(fromEmail, `Your custom poem order — ${requestId || ''}`, buyerHtml);
        }

        return res.status(200).json({ ok: true, sent: sentList });
    } catch (e) {
        return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
}