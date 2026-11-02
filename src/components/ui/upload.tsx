'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import { genUploader } from 'uploadthing/client';
import { ApiError, post } from '@/lib/api';
import { compressImage } from '@/lib/image-compress';
import { Button } from './button';
import { Notice } from './form';

export type UploadRoute =
  | 'consentForm'
  | 'labReport'
  | 'paymentSlip'
  | 'officeBill'
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

/** No bytes moving for this long means a stalled connection. A slow upload that is still moving is never cut off. */
const STALL_TIMEOUT_MS = 60_000;
/** Files sent at the same time when several are picked (D-083). */
const UPLOAD_CONCURRENCY = 3;
const MB = 1024 * 1024;
const isVideo = (f: File) => f.type.startsWith('video/');
const isImage = (f: File) => f.type.startsWith('image/');
const TIMEOUT_MESSAGE = 'Upload mein bohat dair ho gayi — internet / network check karein aur dobara koshish karein.';

async function uploadViaUploadThing(
  route: UploadRoute,
  file: File,
  input: { recordType: string; recordId: string },
  onLoaded: (bytes: number) => void,
): Promise<string> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStalled: (e: Error) => void = () => undefined;
  // Never leave the button spinning: a stalled storage connection surfaces as a retryable error.
  const stalled = new Promise<never>((_, reject) => {
    rejectStalled = reject;
  });
  const armStallTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rejectStalled(new Error(TIMEOUT_MESSAGE));
      abort.abort();
    }, STALL_TIMEOUT_MS);
  };
  armStallTimer();
  const upload = uploadFiles(
    // The router type lives in the backend package; the endpoint/input contract is enforced server-side.
    route as never,
    {
      files: [file],
      input,
      signal: abort.signal,
      onUploadProgress: ({ loaded }: { loaded: number }) => {
        armStallTimer();
        onLoaded(loaded);
      },
    } as never,
  ) as Promise<{ serverData: { attachmentId: string } | null }[]>;
  try {
    const res = await Promise.race([upload, stalled]);
    const id = res[0]?.serverData?.attachmentId;
    if (!id) throw new Error('Upload ho gaya magar server ne attachment confirm nahi kiya. Dobara koshish karein.');
    return id;
  } finally {
    clearTimeout(timer);
  }
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
  if (/size|too large/i.test(msg)) return 'File bohat bari hai (photo max 8MB, video max 64MB).';
  if (/type|mime/i.test(msg)) return 'Is qism ki file allowed nahi.';
  // The storage provider rejected the file itself (e.g. plan does not allow private files) — not the user's fault.
  if (/XHR failed|ingest/i.test(msg)) return 'File storage (UploadThing) ne file reject kar di. Admin se rabta karein — private clinical files ke liye storage plan check karein.';
  return msg || 'Upload nahi hua — dobara koshish karein.';
}

/** Uploads a file made in the page (a drawn signature), with the same fallback as the button. */
export async function uploadFileTo(route: UploadRoute, file: File, input: { recordType: string; recordId: string }): Promise<string> {
  try {
    return await uploadViaUploadThing(route, file, input, () => undefined);
  } catch (e) {
    const unconfigured = e instanceof Error && /UPLOADS_NOT_CONFIGURED|503/.test(e.message);
    if (!unconfigured || (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UPLOAD_STUB !== '1')) throw e;
    return uploadViaDevStub(route, file, input);
  }
}

export function UploadButton({
  route,
  recordType,
  recordId,
  label,
  accept = 'image/*,application/pdf',
  multiple = false,
  onUploaded,
}: {
  route: UploadRoute;
  recordType: string;
  recordId: string;
  label: string;
  accept?: string;
  /** Pick several files at once; up to 3 upload together and each is reported through onUploaded as it finishes. */
  multiple?: boolean;
  onUploaded: (attachmentId: string, file: File) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const uploadOne = async (file: File, onLoaded: (bytes: number) => void) => {
    try {
      return await uploadViaUploadThing(route, file, { recordType, recordId }, onLoaded);
    } catch (e) {
      const unconfigured = e instanceof Error && /UPLOADS_NOT_CONFIGURED|503/.test(e.message);
      // The dev stub is never used by a production build, except the e2e build (NEXT_PUBLIC_UPLOAD_STUB=1) against a
      // backend without an UploadThing token — the backend refuses the stub in production or when uploads are configured.
      if (!unconfigured || (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UPLOAD_STUB !== '1')) throw e;
      return uploadViaDevStub(route, file, { recordType, recordId });
    }
  };

  const onFiles = async (list: FileList | null | undefined) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError(null);
    // Photos are checked after compression, because a large phone photo usually fits once it has been shrunk.
    const tooBig = files.find((f) => !isImage(f) && f.size > (isVideo(f) ? 64 : 8) * MB);
    if (tooBig) {
      if (input.current) input.current.value = '';
      return setError(isVideo(tooBig) ? `${tooBig.name}: video 64MB se choti honi chahiye.` : `${tooBig.name}: file 8MB se choti honi chahiye.`);
    }
    setBusy(true);
    setProgress('');
    const percents = files.map(() => 0);
    let finished = 0;
    const showProgress = () => {
      const percent = Math.round(percents.reduce((a, b) => a + b, 0) / files.length);
      if (percent >= 100) return setProgress(' — save ho raha hai');
      setProgress(`${files.length > 1 ? ` ${finished}/${files.length}` : ''} ${percent}%`);
    };
    const queue = [...files.entries()];
    let firstError: unknown;
    const worker = async () => {
      // A failure stops new files from starting; uploads that finished or are already moving are kept.
      while (firstError === undefined) {
        const next = queue.shift();
        if (!next) return;
        const [i, original] = next;
        try {
          const file = await compressImage(original);
          if (isImage(file) && file.size > 8 * MB) throw new Error(`${file.name}: file 8MB se choti honi chahiye.`);
          const id = await uploadOne(file, (bytes) => {
            percents[i] = Math.min(100, (bytes / file.size) * 100);
            showProgress();
          });
          finished += 1;
          percents[i] = 100;
          showProgress();
          onUploaded(id, file);
        } catch (e) {
          firstError ??= e;
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
      if (firstError !== undefined) setError(friendly(firstError));
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
        // capture opens the camera directly, which blocks picking several files from the gallery
        capture={multiple ? undefined : 'environment'}
        multiple={multiple}
        className="hidden"
        data-upload-route={route}
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {busy && progress !== null ? `Uploading${progress}…` : label}
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
