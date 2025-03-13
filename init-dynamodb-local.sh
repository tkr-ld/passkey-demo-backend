#!/bin/sh

# 公開鍵保存テーブル作成
echo "SLEEP"
sleep 10
echo "パスキー公開鍵情報テーブルの作成"
aws configure set aws_access_key_id dummy
aws configure set aws_secret_access_key dummy
aws configure set region ap-northeast-1
aws dynamodb create-table --endpoint-url http://dynamodb:8000 \
--region ap-northeast-1 \
--table-name passkeyPublicKey \
--attribute-definitions AttributeName=id,AttributeType=S \
--key-schema AttributeName=id,KeyType=HASH \
--provisioned-throughput ReadCapacityUnits=3,WriteCapacityUnits=3
