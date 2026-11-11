import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { MAX_UPLOAD_BYTES, type LeagueDoc, type Store, type Upload } from './store';

/**
 * Everything in one private bucket:
 *   leagues/<id>.json        the league (written with If-Match so two phones can't overwrite each other)
 *   media/<id>/<mediaId>     photos and videos, reached only through short-lived signed links
 */
export class S3Store implements Store {
  private s3 = new S3Client({});
  constructor(private bucket: string) {}

  async get(id: string) {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: `leagues/${id}.json` }));
      const text = await r.Body!.transformToString();
      return { doc: JSON.parse(text) as LeagueDoc, etag: r.ETag! };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async put(id: string, doc: LeagueDoc, etag: string | null) {
    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket, Key: `leagues/${id}.json`, Body: JSON.stringify(doc), ContentType: 'application/json',
        ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
      }));
      return true;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412 || status === 409) return false;
      throw e;
    }
  }

  async uploadTarget(leagueId: string, mediaId: string, contentType: string): Promise<Upload> {
    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: `media/${leagueId}/${mediaId}`,
      Conditions: [['content-length-range', 1, MAX_UPLOAD_BYTES], ['eq', '$Content-Type', contentType]],
      Fields: { 'Content-Type': contentType },
      Expires: 600,
    });
    return { method: 'POST', url, fields };
  }

  async mediaExists(leagueId: string, mediaId: string) {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `media/${leagueId}/${mediaId}` }));
      return true;
    } catch {
      return false;
    }
  }

  async mediaUrl(leagueId: string, mediaId: string) {
    // Signed at the top of the hour so the link stays the same between polls and the phone can cache it.
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: `media/${leagueId}/${mediaId}` }), {
      expiresIn: 2 * 3600,
      signingDate: hour,
    });
  }

  async setReportMarker(leagueId: string, open: boolean) {
    const Key = `reports/open/${leagueId}`;
    if (open) await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key, Body: '1' }));
    else await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }));
  }

  async listReportMarkers() {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'reports/open/', ContinuationToken: token }));
      for (const o of r.Contents ?? []) out.push(o.Key!.slice('reports/open/'.length));
      token = r.NextContinuationToken;
    } while (token);
    return out;
  }

  async deleteMedia(leagueId: string, ids: string[]) {
    if (!ids.length) return;
    await this.s3.send(new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: { Objects: ids.map((m) => ({ Key: `media/${leagueId}/${m}` })) },
    }));
  }
}
