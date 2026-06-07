import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  table: dynamodb.Table;
  attachmentsBucket: s3.Bucket;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, table, attachmentsBucket } = props;

    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    table.grantReadWriteData(lambdaRole);
    attachmentsBucket.grantReadWrite(lambdaRole);

    const commonEnv = {
      TABLE_NAME: table.tableName,
      ATTACHMENTS_BUCKET: attachmentsBucket.bucketName,
      REGION: this.region,
      USER_POOL_ID: userPool.userPoolId,
    };

    // Grant Lambda role permission to manage Cognito users
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:ListUsers',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
      ],
      resources: [userPool.userPoolArn],
    }));

    const backendAsset = lambda.Code.fromAsset(
      path.join(__dirname, '../../backend/dist')
    );

    const makeFn = (fnId: string, handler: string) => {
      const logGroup = new logs.LogGroup(this, `${fnId}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      return new lambda.Function(this, fnId, {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: backendAsset,
        handler,
        role: lambdaRole,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        logGroup,
      });
    };

    const usersFn       = makeFn('UsersFn',       'handlers/users.handler');
    const jobsFn        = makeFn('JobsFn',        'handlers/jobs.handler');
    const piwrFn        = makeFn('PiwrFn',        'handlers/piwr.handler');
    const auditFn       = makeFn('AuditFn',       'handlers/audit.handler');
    const attachmentsFn = makeFn('AttachmentsFn', 'handlers/attachments.handler');
    const formsFn       = makeFn('FormsFn',       'handlers/forms.handler');
    const nciFn         = makeFn('NciFn',         'handlers/nci.handler');
    const customersFn   = makeFn('CustomersFn',   'handlers/customers.handler');
    const crewFn        = makeFn('CrewFn',        'handlers/crew.handler');
    const smsFn         = makeFn('SmsFn',         'handlers/sms.handler');
    const automationsFn = makeFn('AutomationsFn', 'handlers/automations.handler');
    const tenantsFn     = makeFn('TenantsFn',     'handlers/tenants.handler');
    const billingFn     = makeFn('BillingFn',     'handlers/billing.handler');
    const adminFn       = makeFn('AdminFn',        'handlers/admin.handler');

    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'mm-install-pro-api',
      description: 'Tailwind OS API',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'https://app.morrisonmillwork.com',
          'https://d8im2hbxazf8r.cloudfront.net',
        ],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const auth = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // User management (Cognito admin operations)
    const users         = this.api.root.addResource('users');
    users.addMethod('GET',  new apigateway.LambdaIntegration(usersFn), auth);
    users.addMethod('POST', new apigateway.LambdaIntegration(usersFn), auth);
    const userByName    = users.addResource('{username}');
    userByName.addMethod('DELETE', new apigateway.LambdaIntegration(usersFn), auth);
    const userPassword  = userByName.addResource('password');
    userPassword.addMethod('PUT', new apigateway.LambdaIntegration(usersFn), auth);

    const jobs = this.api.root.addResource('jobs');
    jobs.addMethod('GET',  new apigateway.LambdaIntegration(jobsFn), auth);
    jobs.addMethod('POST', new apigateway.LambdaIntegration(jobsFn), auth);

    const job = jobs.addResource('{jobId}');
    job.addMethod('GET',    new apigateway.LambdaIntegration(jobsFn), auth);
    job.addMethod('PUT',    new apigateway.LambdaIntegration(jobsFn), auth);
    job.addMethod('DELETE', new apigateway.LambdaIntegration(jobsFn), auth);

    const piwr = job.addResource('piwr');
    piwr.addMethod('GET',  new apigateway.LambdaIntegration(piwrFn), auth);
    piwr.addMethod('POST', new apigateway.LambdaIntegration(piwrFn), auth);

    const piwrItem = piwr.addResource('{piwrId}');
    piwrItem.addMethod('PUT',    new apigateway.LambdaIntegration(piwrFn), auth);
    piwrItem.addMethod('DELETE', new apigateway.LambdaIntegration(piwrFn), auth);

    const audit = job.addResource('audit');
    audit.addMethod('GET', new apigateway.LambdaIntegration(auditFn), auth);

    const attachments = job.addResource('attachments');
    attachments.addMethod('POST', new apigateway.LambdaIntegration(attachmentsFn), auth);

    const forms   = this.api.root.addResource('forms');
    const formId  = forms.addResource('{formId}');
    formId.addMethod('GET', new apigateway.LambdaIntegration(formsFn), auth);
    formId.addMethod('PUT', new apigateway.LambdaIntegration(formsFn), auth);

    // NCI intake records
    const nci     = this.api.root.addResource('nci');
    nci.addMethod('GET',  new apigateway.LambdaIntegration(nciFn), auth);
    nci.addMethod('POST', new apigateway.LambdaIntegration(nciFn), auth);
    const nciRecord = nci.addResource('{recordId}');
    nciRecord.addMethod('PUT',    new apigateway.LambdaIntegration(nciFn), auth);
    nciRecord.addMethod('DELETE', new apigateway.LambdaIntegration(nciFn), auth);

    // Customer database
    const customers    = this.api.root.addResource('customers');
    customers.addMethod('GET',  new apigateway.LambdaIntegration(customersFn), auth);
    customers.addMethod('POST', new apigateway.LambdaIntegration(customersFn), auth);
    const customerId   = customers.addResource('{customerId}');
    customerId.addMethod('PUT',    new apigateway.LambdaIntegration(customersFn), auth);
    customerId.addMethod('DELETE', new apigateway.LambdaIntegration(customersFn), auth);

    // Crew roster
    const crew   = this.api.root.addResource('crew');
    crew.addMethod('GET',  new apigateway.LambdaIntegration(crewFn), auth);
    crew.addMethod('POST', new apigateway.LambdaIntegration(crewFn), auth);
    const crewId = crew.addResource('{crewId}');
    crewId.addMethod('PUT',    new apigateway.LambdaIntegration(crewFn), auth);
    crewId.addMethod('DELETE', new apigateway.LambdaIntegration(crewFn), auth);

    // SMS queue
    const sms       = this.api.root.addResource('sms');
    sms.addMethod('GET',  new apigateway.LambdaIntegration(smsFn), auth);
    sms.addMethod('POST', new apigateway.LambdaIntegration(smsFn), auth);
    const messageId = sms.addResource('{messageId}');
    messageId.addMethod('PUT', new apigateway.LambdaIntegration(smsFn), auth);

    // Automation rules
    const automations = this.api.root.addResource('automations');
    automations.addMethod('GET',  new apigateway.LambdaIntegration(automationsFn), auth);
    automations.addMethod('POST', new apigateway.LambdaIntegration(automationsFn), auth);
    const ruleId      = automations.addResource('{ruleId}');
    ruleId.addMethod('PUT',    new apigateway.LambdaIntegration(automationsFn), auth);
    ruleId.addMethod('DELETE', new apigateway.LambdaIntegration(automationsFn), auth);

    // Tenants — POST is public (no auth), GET /me and PUT /me require auth
    const tenants    = this.api.root.addResource('tenants');
    tenants.addMethod('POST', new apigateway.LambdaIntegration(tenantsFn));   // public signup
    const tenantsMe  = tenants.addResource('me');
    tenantsMe.addMethod('GET', new apigateway.LambdaIntegration(tenantsFn), auth);
    tenantsMe.addMethod('PUT', new apigateway.LambdaIntegration(tenantsFn), auth);

    // Billing — webhook is public, session/checkout require auth
    const billing         = this.api.root.addResource('billing');
    const billingSession  = billing.addResource('session');
    billingSession.addMethod('GET',  new apigateway.LambdaIntegration(billingFn), auth);
    const billingCheckout = billing.addResource('checkout');
    billingCheckout.addMethod('POST', new apigateway.LambdaIntegration(billingFn), auth);
    const billingWebhook  = billing.addResource('webhook');
    billingWebhook.addMethod('POST', new apigateway.LambdaIntegration(billingFn));  // public

    // Admin — super_admin only (enforced in Lambda)
    const admin          = this.api.root.addResource('admin');
    const adminTenants   = admin.addResource('tenants');
    adminTenants.addMethod('GET', new apigateway.LambdaIntegration(adminFn), auth);
    const adminTenantId  = adminTenants.addResource('{tenantId}');
    adminTenantId.addMethod('PUT',    new apigateway.LambdaIntegration(adminFn), auth);
    adminTenantId.addMethod('DELETE', new apigateway.LambdaIntegration(adminFn), auth);

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      exportName: 'MmApiUrl',
    });
  }
}
