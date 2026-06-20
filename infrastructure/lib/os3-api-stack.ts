import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

// Clean, standalone OS3 backend. Reuses the existing Cognito user pool and
// the existing jobs/customers data table; adds a dedicated OS3 table for
// new entities (service tickets, field checklists). Independent of the
// (drifted) MmApiStack — deploy with: cdk deploy Os3ApiStack
export class Os3ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const EXISTING_USER_POOL_ID = 'us-east-1_jJrlhI979';
    const EXISTING_TABLE_NAME = 'mm-install-pro';
    const existingTableArn = `arn:aws:dynamodb:${this.region}:${this.account}:table/${EXISTING_TABLE_NAME}`;
    // The existing table is encrypted with this customer-managed KMS key;
    // the Lambda role needs decrypt/generate access to read & write it.
    const EXISTING_TABLE_KMS_KEY_ARN = `arn:aws:kms:${this.region}:${this.account}:key/0a3b1eca-356d-423f-9b4d-c63c0ce203e4`;
    const ATTACHMENTS_BUCKET = 'mm-install-pro-attachments-130423149110';

    const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', EXISTING_USER_POOL_ID);

    // New dedicated table for OS3-only entities.
    const os3Table = new dynamodb.Table(this, 'Os3Table', {
      tableName: 'tailwind-os3',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    os3Table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    const lambdaRole = new iam.Role(this, 'Os3LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });
    // Access to the new table (+ its indexes) and the existing shared table.
    os3Table.grantReadWriteData(lambdaRole);
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:BatchWriteItem'],
      resources: [existingTableArn, `${existingTableArn}/index/*`],
    }));
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['kms:Decrypt', 'kms:GenerateDataKey', 'kms:DescribeKey'],
      resources: [EXISTING_TABLE_KMS_KEY_ARN],
    }));
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`arn:aws:s3:::${ATTACHMENTS_BUCKET}/*`],
    }));

    const asset = lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist'));

    const makeFn = (fnId: string, handler: string, tableName: string, extraEnv: Record<string, string> = {}) => {
      const logGroup = new logs.LogGroup(this, `${fnId}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      return new lambda.Function(this, fnId, {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: asset,
        handler,
        role: lambdaRole,
        environment: { TABLE_NAME: tableName, REGION: this.region, ...extraEnv },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        logGroup,
      });
    };

    // Reused handlers → existing data table
    const jobsFn = makeFn('Os3JobsFn', 'handlers/jobs.handler', EXISTING_TABLE_NAME);
    const auditFn = makeFn('Os3AuditFn', 'handlers/audit.handler', EXISTING_TABLE_NAME);
    const customersFn = makeFn('Os3CustomersFn', 'handlers/customers.handler', EXISTING_TABLE_NAME);
    const attachmentsFn = makeFn('Os3AttachmentsFn', 'handlers/attachments.handler', EXISTING_TABLE_NAME, { ATTACHMENTS_BUCKET });
    // New handlers → new OS3 table
    const serviceFn = makeFn('Os3ServiceFn', 'handlers/service.handler', os3Table.tableName);
    const checklistsFn = makeFn('Os3ChecklistsFn', 'handlers/checklists.handler', os3Table.tableName);

    const api = new apigateway.RestApi(this, 'Os3Api', {
      restApiName: 'tailwind-os3-api',
      description: 'Tailwind OS3 API',
      deployOptions: { stageName: 'prod', throttlingRateLimit: 100, throttlingBurstLimit: 200 },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // CORS on error responses too, so 401/4xx/5xx are readable cross-origin.
    api.addGatewayResponse('Default4xx', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: { 'Access-Control-Allow-Origin': "'*'", 'Access-Control-Allow-Headers': "'Content-Type,Authorization'" },
    });
    api.addGatewayResponse('Default5xx', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: { 'Access-Control-Allow-Origin': "'*'", 'Access-Control-Allow-Headers': "'Content-Type,Authorization'" },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Os3Authorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });
    const auth = { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO };
    const integ = (fn: lambda.Function) => new apigateway.LambdaIntegration(fn);

    // /jobs
    const jobs = api.root.addResource('jobs');
    jobs.addMethod('GET', integ(jobsFn), auth);
    jobs.addMethod('POST', integ(jobsFn), auth);
    const job = jobs.addResource('{jobId}');
    job.addMethod('GET', integ(jobsFn), auth);
    job.addMethod('PUT', integ(jobsFn), auth);
    job.addMethod('DELETE', integ(jobsFn), auth);
    job.addResource('audit').addMethod('GET', integ(auditFn), auth);
    job.addResource('attachments').addMethod('POST', integ(attachmentsFn), auth);

    // /customers
    const customers = api.root.addResource('customers');
    customers.addMethod('GET', integ(customersFn), auth);
    customers.addMethod('POST', integ(customersFn), auth);
    const customer = customers.addResource('{customerId}');
    customer.addMethod('PUT', integ(customersFn), auth);
    customer.addMethod('DELETE', integ(customersFn), auth);

    // /service
    const service = api.root.addResource('service');
    service.addMethod('GET', integ(serviceFn), auth);
    service.addMethod('POST', integ(serviceFn), auth);
    const serviceId = service.addResource('{id}');
    serviceId.addMethod('PUT', integ(serviceFn), auth);
    serviceId.addMethod('DELETE', integ(serviceFn), auth);

    // /checklists/{ns} and /checklists/{ns}/{itemId}
    const checklists = api.root.addResource('checklists');
    const checklistNs = checklists.addResource('{ns}');
    checklistNs.addMethod('GET', integ(checklistsFn), auth);
    checklistNs.addResource('{itemId}').addMethod('PUT', integ(checklistsFn), auth);

    new cdk.CfnOutput(this, 'Os3ApiUrl', { value: api.url, exportName: 'Os3ApiUrl' });
    new cdk.CfnOutput(this, 'Os3TableName', { value: os3Table.tableName });
  }
}
