import crypto from 'node:crypto';

function parseStripeSignatureHeader(signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return { timestamp: null, signatures: [] };
  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp = null;
  const signatures = [];
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

function computeStripeV1Signature(timestamp, rawPayload, signingSecret) {
  return crypto.createHmac('sha256', signingSecret).update(`${timestamp}.${rawPayload}`).digest('hex');
}

function timingSafeEqualsHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch { return false; }
}

function verifyStripeSignature({ rawPayload, signatureHeader, signingSecret }) {
  if (!rawPayload || !signatureHeader || !signingSecret)
    return { ok: false, reason: 'Missing payload, signature header, or signing secret.' };
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return { ok: false, reason: 'Invalid Stripe-Signature header format.' };
  const expected = computeStripeV1Signature(timestamp, rawPayload, signingSecret);
  return signatures.some((sig) => timingSafeEqualsHex(sig, expected))
    ? { ok: true }
    : { ok: false, reason: 'Signature mismatch.' };
}

function buildDiscordMessage(evt) {
  const eventId = evt.id ?? 'unknown';
  const type = evt.type ?? 'unknown';
  const mode = evt.livemode ? 'LIVE' : 'TEST';
  let createdIso = new Date().toISOString();
  if (evt.created != null) {
    if (typeof evt.created === 'number') createdIso = new Date(evt.created * 1000).toISOString();
    else if (typeof evt.created === 'string') {
      const parsed = new Date(evt.created);
      if (!Number.isNaN(parsed.getTime())) createdIso = parsed.toISOString();
    }
  }
  return {
    embeds: [{
      title: 'Stripe Event',
      description: `Received **${type}** from Stripe (${mode}).`,
      color: 0x00A86B,
      fields: [
        { name: 'Event ID', value: String(eventId), inline: false },
        { name: 'Type', value: String(type), inline: true },
        { name: 'Mode', value: String(mode), inline: true },
      ],
      timestamp: createdIso,
    }],
  };
}

export async function POST(rawPayload, stripeSignature, signingSecret = '', discordWebhookUrl = '') {
  const resolvedSigningSecret = signingSecret || process.env.STRIPE_SIGNING_SECRET || '';
  const resolvedWebhookUrl = discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || '';
  const verification = verifyStripeSignature({ rawPayload, signatureHeader: stripeSignature, signingSecret: resolvedSigningSecret });
  if (!verification.ok) return { accepted: false, forwarded: false, verified: false, error: verification.reason };
  if (!resolvedWebhookUrl) return { accepted: true, forwarded: false, verified: true, error: 'DISCORD_WEBHOOK_URL is not configured.' };
  let evt;
  try { evt = JSON.parse(rawPayload); } catch { return { accepted: false, forwarded: false, verified: true, error: 'Invalid rawPayload JSON.' }; }
  const discordBody = buildDiscordMessage(evt);
  const response = await fetch(resolvedWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discordBody) });
  return { accepted: true, verified: true, forwarded: response.ok, stripeEventId: evt.id ?? null, stripeEventType: evt.type ?? null, discordStatus: response.status };
}
