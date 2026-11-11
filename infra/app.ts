// Belted backend: one private S3 bucket and one Lambda behind a Function URL.
// Deploys as its own stack ("belted"), separate from everything else in the account.
import * as path from 'node:path';
import { App, CfnOutput, Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

const ORIGINS = ['https://somsafavi-hash.github.io', 'http://localhost:5199', 'http://127.0.0.1:5199', 'http://localhost:5173'];
const root = path.resolve(__dirname, '..');

const app = new App();
// Pinned to the My Sign account so a deploy with the wrong credentials fails instead of landing elsewhere.
const stack = new Stack(app, 'belted', {
  env: { account: '889002527942', region: 'us-east-2' },
  description: 'Belted: friend-group league app API and media',
});
Tags.of(stack).add('project', 'belted');

const bucket = new s3.Bucket(stack, 'Data', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: RemovalPolicy.RETAIN,
  cors: [{
    allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
    allowedOrigins: ORIGINS,
    allowedHeaders: ['*'],
    maxAge: 3000,
  }],
});

const fn = new NodejsFunction(stack, 'Api', {
  entry: path.join(root, 'server/lambda.ts'),
  handler: 'main',
  projectRoot: root,
  depsLockFilePath: path.join(root, 'package-lock.json'),
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  memorySize: 512,
  timeout: Duration.seconds(15),
  environment: { BUCKET: bucket.bucketName },
  logGroup: new logs.LogGroup(stack, 'ApiLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
  bundling: { minify: true, target: 'node22', externalModules: [] },
});
bucket.grantReadWrite(fn);
bucket.grantDelete(fn);

const url = fn.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ORIGINS,
    allowedHeaders: ['authorization', 'content-type'],
    allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
    maxAge: Duration.hours(1),
  },
});

// AWS now also requires lambda:InvokeFunction (limited to calls through the URL) for public Function URLs.
const viaUrl = new lambda.CfnPermission(stack, 'InvokeViaUrl', { action: 'lambda:InvokeFunction', functionName: fn.functionName, principal: '*' });
viaUrl.addPropertyOverride('InvokedViaFunctionUrl', true);

new CfnOutput(stack, 'ApiUrl', { value: url.url });
new CfnOutput(stack, 'BucketName', { value: bucket.bucketName });
