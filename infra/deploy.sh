#!/bin/sh
# Deploys the belted stack to the My Sign AWS account only.
set -e
export AWS_REGION=us-east-2 AWS_DEFAULT_REGION=us-east-2 JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1
CREDS="$(aws configure export-credentials --profile mysign --format env)"
[ -n "$CREDS" ] || { echo "Couldn't get mysign credentials. Stopping."; exit 1; }
eval "$CREDS"
unset AWS_PROFILE
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
[ "$ACCOUNT" = "889002527942" ] || { echo "Wrong AWS account ($ACCOUNT). Stopping."; exit 1; }
[ -s ../.admin-key ] || { echo "Missing ../.admin-key (the moderation admin key). Stopping."; exit 1; }
export ADMIN_KEY_SHA256="$(node -e "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync('../.admin-key','utf8').trim()).digest('hex'))")"
echo "Deploying to My Sign account $ACCOUNT"
npx cdk deploy --require-approval never --no-notices --outputs-file outputs.json
