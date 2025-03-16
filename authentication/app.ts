import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    GetCommandInput,
    PutCommand,
    PutCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { AuthenticationResponseJSON, verifyAuthenticationResponse } from '@simplewebauthn/server';
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

interface PublicKeyCredential {
    id: string;
    publicKey: string;
    aaguid: string;
    registerTime: string;
    last_used: string | null;
    user_id?: string;
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const credentials: AuthenticationResponseJSON = JSON.parse(event.body as string);
        // ヘッダーからチャレンジを取得
        const challenge = event.headers['Challenge'] as string;
        const id = credentials.id;

        // DynamoDBにデータを登録する
        const dynamodbClient = new DynamoDBClient({
            endpoint: 'http://dynamodb:8000',
            region: 'ap-northeast-1',
            credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
        });
        const docClient = DynamoDBDocumentClient.from(dynamodbClient);
        const params: GetCommandInput = {
            TableName: 'passkeyPublicKey',
            Key: {
                id: id,
            },
        };
        const command = new GetCommand(params);
        const data = await docClient.send(command);
        const publicKeyCredential = data.Item as unknown as PublicKeyCredential;
        console.log(publicKeyCredential);

        const verification = await verifyAuthenticationResponse({
            response: credentials,
            expectedChallenge: challenge,
            expectedOrigin: 'http://localhost:5173',
            expectedRPID: 'localhost',
            credential: {
                id: id,
                publicKey: isoBase64URL.toBuffer(publicKeyCredential.publicKey),
                counter: 0,
                // transports: passkey.transports,
            },
            requireUserVerification: false,
        });

        // authenticationInfoを使うかどうかは検討
        const { verified, authenticationInfo } = verification;

        if (!verified) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    message: 'verification failed',
                }),
            };
        }

        const updateParams: PutCommandInput = {
            TableName: 'passkeyPublicKey',
            Item: {
                ...publicKeyCredential,
                laÏst_used: new Date().toISOString(),
            },
        };

        const updateCommnad = new PutCommand(updateParams);
        await docClient.send(updateCommnad);

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
            headers: {
                'Access-Control-Allow-Origin': '*', // 全てを許可してしまうので、本来はよろしくない
            },
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
    }
};
