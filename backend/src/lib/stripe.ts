import * as https from 'https';

/**
 * Minimal Stripe client with Connect support.
 *
 * Job payments are customer → contractor, not customer → us, so the money must
 * settle in the tenant's own Stripe account. Every call that moves job money
 * therefore runs *on behalf of* a connected account via the Stripe-Account
 * header. (The subscription billing in billing.ts is the opposite direction —
 * tenant → platform — and correctly runs on the platform account.)
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';

export class StripeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface StripeOpts {
  /** Connected account id (acct_…) to act on behalf of. */
  stripeAccount?: string;
  /** Makes retries safe — Stripe returns the original result for a repeat key. */
  idempotencyKey?: string;
}

/** Flatten nested params into Stripe's bracket form: metadata[jobId]=… */
function encode(data: Record<string, unknown>, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) out.push(...encode(v as Record<string, unknown>, key));
    else if (Array.isArray(v)) v.forEach((item, i) => {
      if (typeof item === 'object') out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`));
      else out.push([`${key}[${i}]`, String(item)]);
    });
    else out.push([key, String(v)]);
  }
  return out;
}

export function stripeRequest<T = any>(
  method: 'GET' | 'POST',
  path: string,
  data?: Record<string, unknown>,
  opts: StripeOpts = {},
): Promise<T> {
  if (!STRIPE_SECRET_KEY) return Promise.reject(new StripeError(500, 'Stripe is not configured.'));

  return new Promise((resolve, reject) => {
    const params = data ? new URLSearchParams(encode(data)).toString() : '';
    const isGet = method === 'GET';
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (!isGet) headers['Content-Length'] = String(Buffer.byteLength(params));
    if (opts.stripeAccount) headers['Stripe-Account'] = opts.stripeAccount;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const req = https.request(
      { hostname: 'api.stripe.com', path: isGet && params ? `${path}?${params}` : path, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { parsed = { error: { message: raw } }; }
          // The previous helper resolved on 4xx too, so failures looked like
          // successes with missing fields. Surface them instead.
          if ((res.statusCode ?? 500) >= 400) {
            reject(new StripeError(res.statusCode ?? 500, parsed?.error?.message ?? 'Stripe request failed'));
          } else {
            resolve(parsed as T);
          }
        });
      },
    );
    req.on('error', (e) => reject(new StripeError(502, e.message)));
    if (!isGet && params) req.write(params);
    req.end();
  });
}

export const stripeConfigured = () => !!STRIPE_SECRET_KEY;
