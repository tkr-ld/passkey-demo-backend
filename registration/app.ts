import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { RegistrationResponseJSON, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const credentials: RegistrationResponseJSON = JSON.parse(event.body as string);
        // ヘッダーからチャレンジを取得
        const challenge = event.headers['Challenge'] as string;
        console.log(credentials);
        // 認証情報の検証
        const { verified, registrationInfo } = await verifyRegistrationResponse({
            response: credentials,
            expectedChallenge: challenge,
            expectedOrigin: 'http://localhost:5173',
            // PRID(ドメイン)
            expectedRPID: 'localhost',
            // requireUserVerification: ユーザー検証が必要かどうかを指定する
            // falseの場合、認証器はユーザーの存在を確認するだけで、特定のユーザーが認証器を操作していることを検証しない
            requireUserVerification: false,
        });

        if (!verified) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    message: 'verification failed',
                }),
            };
        }

        if (!registrationInfo) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'registrationInfo is not found',
                }),
            };
        }
        const { credential, aaguid } = registrationInfo;

        const publicKey = isoBase64URL.fromBuffer(credential.publicKey);

        // TODO 同期パスキーであるかの判定

        // DynamoDBにデータを登録する
        const dynamodbClient = new DynamoDBClient({
            endpoint: 'http://dynamodb:8000',
            region: 'ap-northeast-1',
            credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
        });
        const docClient = DynamoDBDocumentClient.from(dynamodbClient);
        const params: PutCommandInput = {
            TableName: 'passkeyPublicKey',
            Item: {
                id: credential.id,
                publicKey,
                aaguid,
                registerTime: new Date().toISOString(),
                last_used: null,
                // TODO ユーザーIDをどうするか
                //user_id: 'user1',
            },
        };

        const command = new PutCommand(params);
        await docClient.send(command);

        return {
            headers: {
                'Access-Control-Allow-Origin': '*', // 全てを許可してしまうので、本来はよろしくない
            },
            statusCode: 200,
            body: JSON.stringify({
                message: 'OK',
            }),
        };
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
    }
};
