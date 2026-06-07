/**
 * One-time migration: prefix all existing DynamoDB items with TENANT#mm#
 * and set custom:tenantId = 'mm' on all existing Cognito users.
 *
 * Run ONCE after deploying the updated Lambda handlers:
 *   cd backend && node dist/scripts/migrate-tenant.js
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION        = 'us-east-1';
const TABLE         = 'mm-install-pro';
const USER_POOL_ID  = 'us-east-1_jJrlhI979';
const TENANT_ID     = 'mm';   // Morrison Millwork gets this ID

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const cognito = new CognitoIdentityProviderClient({ region: REGION });

async function migrateDynamo() {
  console.log('Scanning DynamoDB for items to migrate...');
  let migrated = 0;
  let skipped  = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
      Limit: 100,
    }));

    for (const item of result.Items ?? []) {
      // Skip already-migrated items and TENANT_CONFIG records
      if (item.PK.startsWith('TENANT#') || item.PK.startsWith('TENANT_CONFIG#')) {
        skipped++;
        continue;
      }

      const newItem: Record<string, any> = { ...item };
      newItem.PK     = `TENANT#${TENANT_ID}#${item.PK}`;
      if (item.GSI1PK) newItem.GSI1PK = `TENANT#${TENANT_ID}#${item.GSI1PK}`;
      if (item.GSI2PK) newItem.GSI2PK = `TENANT#${TENANT_ID}#${item.GSI2PK}`;

      await dynamo.send(new PutCommand({ TableName: TABLE, Item: newItem }));
      await dynamo.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
      }));
      migrated++;

      if (migrated % 10 === 0) process.stdout.write(`  ${migrated} items migrated...\r`);
    }

    lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);

  console.log(`\nDynamoDB: migrated ${migrated} items, skipped ${skipped}.`);
}

async function migrateCognito() {
  console.log('Updating Cognito users with tenantId = mm...');
  let updated = 0;
  let token: string | undefined;

  do {
    const result = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      PaginationToken: token,
      Limit: 60,
    }));

    for (const user of result.Users ?? []) {
      const attrs = user.Attributes ?? [];
      const hasTenantId = attrs.some(a => a.Name === 'custom:tenantId' && a.Value);
      if (hasTenantId) { updated++; continue; }

      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.Username!,
        UserAttributes: [{ Name: 'custom:tenantId', Value: TENANT_ID }],
      }));
      updated++;
      console.log(`  Updated user: ${user.Username}`);
    }

    token = result.PaginationToken;
  } while (token);

  console.log(`Cognito: ${updated} users processed.`);
}

async function createTenantConfig() {
  console.log('Creating tenant config record for "mm"...');
  const now = new Date().toISOString();
  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK:         `TENANT_CONFIG#${TENANT_ID}`,
      SK:         'CONFIG',
      GSI1PK:     'ALL_TENANTS',
      GSI1SK:     `CREATED#${now}#${TENANT_ID}`,
      tenantId:   TENANT_ID,
      companyName:'Morrison Millwork',
      adminEmail: '',
      plan:       'pro',
      status:     'active',
      createdAt:  now,
      updatedAt:  now,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));
  console.log('Tenant config created (or already existed).');
}

(async () => {
  try {
    await migrateDynamo();
    await migrateCognito();
    await createTenantConfig();
    console.log('\nMigration complete.');
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('Tenant config already exists — skipping creation.');
    } else {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  }
})();
