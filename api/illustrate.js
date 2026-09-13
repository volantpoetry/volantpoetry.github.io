// ============================================================
// FILE: Illustration/api/illustrate.js
// ============================================================
// Vercel Serverless Function - Poem -> Illustration generator
// ------------------------------------------------------------
//   POST { poem, style? }  ->  { success, url, provider }
//
// Diffusion-only pipeline.
//
// LOCAL Stable Diffusion (your own GPU) is handled in the browser, NOT
// here — this function runs on Vercel, so 127.0.0.1 would be Vercel's
// machine. On your own PC the page calls your local SD WebUI/Forge
// directly (http://127.0.0.1:7860) and only falls back to this cloud
// endpoint when the local engine is unreachable.
//
// Cloud: keyless Pollinations (Stable Diffusion in the cloud, free, no
// setup). No OpenAI.
// ============================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Use POST.' });
    }

    try {
        const body = req.body || {};
        const poem = typeof body.poem === 'string' ? body.poem.trim() : '';
        if (!poem) {
            return res.status(400).json({ success: false, message: 'Write a poem first.' });
        }

        const style = (typeof body.style === 'string' && body.style.trim())
            ? body.style.trim()
            : 'soft watercolor, storybook, warm light, no text';

        const prompt = `A beautiful, dreamy illustration inspired by this poem:\n\n"""\n${poem.slice(0, 1500)}\n"""\n\nStyle: ${style}. No text, no letters, no words anywhere in the image.`;

        // ============================================================
        // CLOUD: Keyless Pollinations — Stable Diffusion, no key needed
        // ============================================================
        const fallbackUrl =
            'https://image.pollinations.ai/prompt/' +
            encodeURIComponent(`${prompt}, high detail`) +
            `?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

        return res.json({ success: true, url: fallbackUrl, provider: 'pollinations' });

    } catch (err) {
        console.error('❌ Illustration error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
    }
};