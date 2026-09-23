/**
 * Sewnie waitlist signup relay.
 *
 * Deploy this as a Cloudflare Worker. It's the only place the Resend API key
 * lives — the static site (GitHub Pages) just POSTs an email here.
 *
 * Required Worker settings (Cloudflare dashboard → your Worker → Settings → Variables):
 *   RESEND_API_KEY   (secret)  — from resend.com/api-keys
 *   RESEND_AUDIENCE_ID (text)  — from resend.com/audiences, the waitlist audience's ID
 *   ALLOWED_ORIGIN   (text)    — the site that's allowed to call this,
 *                                e.g. https://yourname.github.io  (no trailing slash)
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400, corsHeaders);
    }

    const email = (body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Enter a valid email.' }, 400, corsHeaders);
    }

    const resendRes = await fetch(
      `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      }
    );

    if (!resendRes.ok) {
      // Resend returns 409-ish/validation errors for a contact that already
      // exists on some plans — treat that as a success from the user's side.
      const errText = await resendRes.text();
      if (resendRes.status === 409 || /already exists/i.test(errText)) {
        return json({ ok: true }, 200, corsHeaders);
      }
      return json({ error: 'Something went sideways. Try again.' }, 502, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  },
};

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
