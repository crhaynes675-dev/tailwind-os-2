#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { DnsStack } from '../lib/dns-stack';
import { CertStack } from '../lib/cert-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const DOMAIN      = 'morrisonmillwork.com';
const APP_SUB     = `app.${DOMAIN}`;

// Phase 1 — deploy these now
const auth     = new AuthStack(app, 'MmAuthStack', { env });
const database = new DatabaseStack(app, 'MmDatabaseStack', { env });
const storage  = new StorageStack(app, 'MmStorageStack', { env });
new DnsStack(app, 'MmDnsStack', { env, domainName: DOMAIN });

const api = new ApiStack(app, 'MmApiStack', {
  env,
  userPool: auth.userPool,
  table: database.table,
  attachmentsBucket: storage.attachmentsBucket,
});

new FrontendStack(app, 'MmFrontendStack', {
  env,
  api: api.api,
});

// Phase 2 — deploy after nameservers are updated at registrar
// npx cdk deploy MmCertStack --require-approval never
new CertStack(app, 'MmCertStack', {
  env,
  domainName: DOMAIN,
  appSubdomain: APP_SUB,
});
