import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { ddb, TABLE } from './dynamo';
import { tpk } from './tenant';

/**
 * Customer share links.
 *
 * A public request arrives with no login and no tenant, so the token has to be
 * what resolves both. Rather than encoding (and having to sign) tenant/job in
 * the token, we store a standalone pointer record keyed by the token:
 *
 *   PK = SHARE#{token}   SK = LINK   -> { tenantId, jobId, revokedAt? }
 *
 * That keeps lookup a single O(1) GetItem with no extra index, and revoking a
 * link never touches the job record.
 */

export interface ShareLink {
  token: string;
  tenantId: string;
  jobId: string;
  createdAt: string;
  createdBy?: string;
  revokedAt?: string;
}

/** 32 chars of base64url ≈ 192 bits — not brute-forceable, safe in a URL/SMS. */
export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

const shareKey = (token: string) => ({ PK: `SHARE#${token}`, SK: 'LINK' });

/** Resolve a token to its job. Returns null for unknown or revoked links. */
export async function resolveShareToken(token: string): Promise<ShareLink | null> {
  // Guard the shape before spending a read — tokens are fixed-alphabet.
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: shareKey(token) }));
  const item = res.Item as ShareLink | undefined;
  if (!item || item.revokedAt) return null;
  return item;
}

/**
 * Mint a link for a job, replacing any previous one. The old token is revoked
 * rather than deleted so a customer following a stale link gets a clean "this
 * link is no longer active" instead of an ambiguous 404.
 */
export async function createShareLink(
  tenantId: string,
  jobId: string,
  createdBy?: string,
): Promise<ShareLink> {
  const existing = await getJobShareToken(tenantId, jobId);
  if (existing) await revokeShareToken(existing);

  const token = newShareToken();
  const link: ShareLink = { token, tenantId, jobId, createdAt: new Date().toISOString(), createdBy };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...shareKey(token), ...link } }));

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: tpk(tenantId, 'JOB', jobId), SK: 'METADATA' },
    UpdateExpression: 'SET shareToken = :t, shareCreatedAt = :c',
    ExpressionAttributeValues: { ':t': token, ':c': link.createdAt },
  }));

  return link;
}

export async function getJobShareToken(tenantId: string, jobId: string): Promise<string | null> {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: tpk(tenantId, 'JOB', jobId), SK: 'METADATA' },
    ProjectionExpression: 'shareToken',
  }));
  return (res.Item?.shareToken as string) ?? null;
}

export async function revokeShareToken(token: string): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: shareKey(token),
      UpdateExpression: 'SET revokedAt = :r',
      ExpressionAttributeValues: { ':r': new Date().toISOString() },
      // Don't resurrect a deleted pointer as a bare {revokedAt} record.
      ConditionExpression: 'attribute_exists(PK)',
    }));
  } catch {
    // No such link (already deleted) — nothing to revoke.
  }
}
