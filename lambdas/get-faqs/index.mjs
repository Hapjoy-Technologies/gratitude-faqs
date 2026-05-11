import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// CORS is configured on the Lambda Function URL (AWS Console).
// Do NOT add Access-Control-* headers here, or the browser will see
// duplicate values and reject the response.

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET_NAME;
const KEY = process.env.OBJECT_KEY || 'faqs.json';

const streamToString = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
};

export const handler = async (event) => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || 'GET';

    if (method !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
        const body = await streamToString(res.Body);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
            },
            body
        };
    } catch (err) {
        console.error('Failed to fetch FAQ JSON:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to load FAQs' })
        };
    }
};
