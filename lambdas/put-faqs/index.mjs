import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { extname } from 'node:path';

// CORS is configured on the Lambda Function URL (AWS Console).
// Do NOT add Access-Control-* headers here, or the browser will see
// duplicate values and reject the response.

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET_NAME;
const CONTENT_KEY = process.env.OBJECT_KEY || 'faqs.json';
const PASSWORD = process.env.EDITOR_PASSWORD || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; // e.g. https://my-bucket.s3.amazonaws.com

const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

const passwordOk = (provided) => {
    if (!PASSWORD || !provided) return false;
    const a = Buffer.from(PASSWORD);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
};

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

const sanitizeFilename = (name) => {
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) return null;
    const base = name.slice(0, -ext.length).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'image';
    const suffix = randomBytes(4).toString('hex');
    return `${base}-${suffix}${ext}`;
};

const isValidFaqShape = (data) => {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.categories)) return false;
    for (const c of data.categories) {
        if (typeof c.slug !== 'string' || !c.slug) return false;
        if (typeof c.title !== 'string') return false;
        if (typeof c.icon !== 'string') return false;
        if (!Array.isArray(c.questions)) return false;
        for (const q of c.questions) {
            if (typeof q.slug !== 'string' || !q.slug) return false;
            if (typeof q.title !== 'string') return false;
            if (typeof q.answer !== 'string') return false;
        }
    }
    return true;
};

export const handler = async (event) => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || 'POST';
    if (method !== 'POST') return json(405, { error: 'Method not allowed' });

    const headers = event.headers || {};
    const provided = headers['x-editor-password'] || headers['X-Editor-Password'] || '';
    if (!passwordOk(provided)) {
        return json(401, { error: 'Unauthorized' });
    }

    let body;
    try {
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : (event.body || '');
        body = JSON.parse(raw);
    } catch {
        return json(400, { error: 'Invalid JSON body' });
    }

    const action = body?.action;

    if (action === 'verify') {
        return json(200, { ok: true });
    }

    if (action === 'save-content') {
        const content = body.content;
        if (!isValidFaqShape(content)) {
            return json(400, { error: 'Invalid FAQ shape' });
        }
        try {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: CONTENT_KEY,
                Body: JSON.stringify(content, null, 2),
                ContentType: 'application/json',
                CacheControl: 'public, max-age=60'
            }));
            return json(200, { ok: true });
        } catch (err) {
            console.error('Failed to write FAQ JSON:', err);
            return json(500, { error: 'Failed to save' });
        }
    }

    if (action === 'upload-image') {
        const { filename, dataBase64 } = body;
        if (typeof filename !== 'string' || typeof dataBase64 !== 'string') {
            return json(400, { error: 'filename and dataBase64 required' });
        }
        const safeName = sanitizeFilename(filename);
        if (!safeName) {
            return json(400, { error: 'Unsupported file type' });
        }
        const ext = extname(safeName).toLowerCase();
        let buffer;
        try {
            buffer = Buffer.from(dataBase64, 'base64');
        } catch {
            return json(400, { error: 'Invalid base64 data' });
        }
        if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
            return json(400, { error: 'Image must be between 1 byte and 5 MB' });
        }
        const key = `articles/${safeName}`;
        try {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: MIME_BY_EXT[ext] || 'application/octet-stream',
                CacheControl: 'public, max-age=31536000, immutable'
            }));
            const url = PUBLIC_BASE_URL
                ? `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
                : `https://${BUCKET}.s3.amazonaws.com/${key}`;
            return json(200, { ok: true, url, key });
        } catch (err) {
            console.error('Failed to upload image:', err);
            return json(500, { error: 'Failed to upload image' });
        }
    }

    return json(400, { error: 'Unknown action' });
};
