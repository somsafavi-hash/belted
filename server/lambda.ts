// AWS Lambda entry (Function URL). CORS is handled by the Function URL config.
import { handle } from './handler';
import { S3Store } from './s3Store';

const store = new S3Store(process.env.BUCKET!);

interface UrlEvent {
  rawPath: string;
  headers: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

export async function main(event: UrlEvent) {
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const res = await handle({ method: event.requestContext.http.method, path: event.rawPath, headers: event.headers, body }, store);
  return {
    statusCode: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(res.body),
  };
}
