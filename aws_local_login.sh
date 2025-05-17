#!/bin/bash -e

PROFILE=zoom-sso-dev
ACCOUNT=003833989744
ROLE_NAME=dev-csms-read-only
AWS_CREDS_FILE=~/.aws/credentials

>$AWS_CREDS_FILE

if ! command jq --version &> /dev/null
then
    echo "jq is required for this script. please install it"
    exit
fi

if ! command aws --version &> /dev/null
then
    echo "aws cli is required for this script. please install it"
    exit
fi

aws --profile $PROFILE sso login

JSONFILE=~/.aws/sso/cache/$(ls -t ~/.aws/sso/cache/ | head -n 1)

ACCESS_TOKEN=$(cat $JSONFILE | jq -r .accessToken )

CREDS=$(aws sso get-role-credentials --account-id $ACCOUNT --access-token $ACCESS_TOKEN --role-name $ROLE_NAME --region us-east-1)

ACCESS_KEY=$(echo $CREDS | jq -r .roleCredentials.accessKeyId )
SECRET_KEY=$(echo $CREDS | jq -r .roleCredentials.secretAccessKey )
SESSION_TOKEN=$(echo $CREDS | jq -r .roleCredentials.sessionToken )
EXPIRATION=$(echo $CREDS | jq -r .roleCredentials.expiration )

cat << EOF > $AWS_CREDS_FILE
[default]
aws_access_key_id = $ACCESS_KEY
aws_secret_access_key = $SECRET_KEY
aws_session_token = $SESSION_TOKEN
expiration = $EXPIRATION
EOF