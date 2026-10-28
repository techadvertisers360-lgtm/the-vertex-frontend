'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import { genUploader } from 'uploadthing/client';
import { ApiError, post } from '@/lib/api';
import { Button } from './button';
import { Notice } from './form';

export type UploadRoute =
  | 'consentForm'
  | 'prescriptionPhoto'
  | 'beforePhoto'
  | 'afterPhoto'
  | 'itemsUsedEvidence'
  | 'roomCleanPhoto'
  | 'roomChecklistPhoto'
  | 'machineIssuePhoto'
  | 'damagePhoto'
  | 'adCreative'
  | 'requestAttachment'
  | 'complaintAttachment'
  | 'vendorInvoice';

/**
 * Uploads go to the backend UploadThing route (`/api/uploadthing`, same-origin via the Next rewrite so the session
 * cookie is sent). The backend middleware checks role + record scope before UploadThing accepts the file, stores
 * the attachment (private ACL for clinical files) in onUploadComplete and returns its id (spec §22).
 */
const { uploadFiles } = genUploader({ url: '/api/uploadthing', package: 'vertex-health-frontend' });

async function uploadViaUploadThing(route: UploadRoute, file: File, input: { recordType: string; recordId: string }): Promise<string> {
  // The router type lives in the backend package; the endpoint/input contract is enforced server-side.
  const res = (await uploadFiles(route as never, { files: [file], input } as never)) as { serverData: { attachmentId: string } | null }[];
  const id = res[0]?.serverData?.attachmentId;
  if (!id) throw new Error('Upload ho gaya magar server ne attachment confirm nahi kiya. Dobara koshish karein.');
  return id;
}

const UPLOAD_TIMEOUT_MS = 60_000;
const TIMEOUT_MESSAGE = 'Upload mein bohat dair ho gayi — internet / network check karein aur dobara koshish karein.';

/** Never leave the button spinning: a stalled storage connection surfaces as a retryable error. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Development fallback when the backend reports uploads unconfigured (no UPLOADTHING_TOKEN, D-009). */
async function uploadViaDevStub(route: UploadRoute, file: File, input: { recordType: string; recordId: string }): Promise<string> {
  const r = await post<{ attachmentId: string }>('/files/dev-upload', { route, ...input, fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size });
  return r.attachmentId;
}

function friendly(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/forbidden|ijazat/i.test(msg)) return 'Aap ko is record par file upload ki ijazat nahi.';
  if (/size|too large/i.test(msg)) return 'File bohat bari hai (max 8MB).';
  if (/type|mime/i.test(msg)) return 'Is qism ki file allowed nahi.';
  // The storage provider rejected the file itself (e.g. plan does not allow private files) — not the user's fault.
  if (/XHR failed|ingest/i.test(msg)) return 'File storage (UploadThing) ne file reject kar di. Admin se rabta karein — private clinical files ke liye storage plan check karein.';
  return msg || 'Upload nahi hua — dobara koshish karein.';
}

export function UploadButton({
  route,
  recordType,
  recordId,
  label,
  accept = 'image/*,application/pdf',
  onUploaded,
}: {
  route: UploadRoute;
  recordType: string;
  recordId: string;
  label: string;
  accept?: string;
  onUploaded: (attachmentId: string) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 8 * 1024 * 1024) return setError('File 8MB se choti honi chahiye.');
    setBusy(true);
    setProgress(0);
    try {
      let id: string;
      try {
        id = await withTimeout(uploadViaUploadThing(route, file, { recordType, recordId }), UPLOAD_TIMEOUT_MS);
      } catch (e) {
        const unconfigured = e instanceof Error && /UPLOADS_NOT_CONFIGURED|503/.test(e.message);
        // The dev stub is never used by a production build, except the e2e build (NEXT_PUBLIC_UPLOAD_STUB=1) against a
        // backend without an UploadThing token — the backend refuses the stub in production or when uploads are configured.
        if (!unconfigured || (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UPLOAD_STUB !== '1')) throw e;
        id = await uploadViaDevStub(route, file, { recordType, recordId });
      }
      onUploaded(id);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        data-upload-route={route}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {busy && progress !== null ? 'Uploading…' : label}
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
