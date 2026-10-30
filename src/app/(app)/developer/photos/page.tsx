'use client';
import * as React from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, ImageOff } from 'lucide-react';
import { ApiError, get } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { titleCase } from '@/lib/utils';
import type { UploadRoute } from '@/components/ui/upload';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';

/**
 * Developer photo gallery (D-072): every uploaded photo, newest first, filter by kind and date; open or download
 * one, or download every photo in the list. Each picture is fetched through /api/files/:id/url (audited).
 */
interface Photo {
  id: string;
  route: UploadRoute;
  fileName: string;
  mime: string;
  size: number;
  recordType: string;
  createdAt: string;
  uploadedBy: string | null;
  uploadedByRole: string | null;
  /** How to open it; null url in 'signed' mode means ask /files/:id/url (D-077). */
  url: string | null;
  mode: FileUrl['mode'];
}
interface PhotoPage {
  total: number;
  items: Photo[];
  nextCursor: string | null;
}
interface FileUrl {
  url: string | null;
  mode: 'public' | 'signed' | 'proxy' | 'stub';
}

const ROUTES: { value: UploadRoute; label: string }[] = [
  { value: 'beforePhoto', label: 'Before photo' },
  { value: 'afterPhoto', label: 'After photo' },
  { value: 'consentForm', label: 'Consent form' },
  { value: 'prescriptionPhoto', label: 'Prescription' },
  { value: 'itemsUsedEvidence', label: 'Items used' },
  { value: 'roomCleanPhoto', label: 'Room clean' },
  { value: 'roomChecklistPhoto', label: 'Room checklist' },
  { value: 'machineIssuePhoto', label: 'Machine issue' },
  { value: 'damagePhoto', label: 'Damage' },
  { value: 'adCreative', label: 'Ad creative' },
  { value: 'requestAttachment', label: 'Request' },
  { value: 'complaintAttachment', label: 'Complaint' },
  { value: 'vendorInvoice', label: 'Vendor invoice' },
];
const routeLabel = (r: UploadRoute) => ROUTES.find((x) => x.value === r)?.label ?? r;

const fileUrl = (id: string) => get<FileUrl>(`/files/${id}/url`);

/** The list already says how to open most photos; only signed-URL mode needs a /url request. */
const openPhoto = (p: Photo): Promise<FileUrl> => (p.mode === 'signed' ? fileUrl(p.id) : Promise.resolve({ url: p.url, mode: p.mode }));

/**
 * At most 4 pictures load at a time (D-077): each one is a request to our server, and a whole page of them at once
 * opened more database connections than the database allows.
 */
const MAX_LOADING = 4;
let loading = 0;
const waiting: (() => void)[] = [];
function takeSlot(): Promise<void> {
  if (loading < MAX_LOADING) {
    loading++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else loading--;
}

/** Save one photo to the computer. Our proxy sends it as a download; other URLs are fetched as a blob. */
async function downloadPhoto(p: Photo) {
  const r = await openPhoto(p);
  if (!r.url) throw new Error(r.mode === 'stub' ? 'Dev stub — asli file store nahi hui' : 'File available nahi');
  const a = document.createElement('a');
  a.download = p.fileName;
  if (r.mode === 'proxy') {
    a.href = `${r.url}?download=1`;
    a.click();
    return;
  }
  try {
    const blob = await (await fetch(r.url)).blob();
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    window.open(r.url, '_blank', 'noopener');
  }
}

/** Loads only once on screen, then waits for a free slot; the slot is freed when the picture loads or fails. */
function Thumb({ p }: { p: Photo }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [src, setSrc] = React.useState<string | null>(null);
  const held = React.useRef(false);
  const q = useQuery({ queryKey: ['developer', 'photo-url', p.id], queryFn: () => openPhoto(p), staleTime: 4 * 60_000, enabled: visible });

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const url = q.data?.url ?? null;
  React.useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void takeSlot().then(() => {
      if (cancelled) return releaseSlot();
      held.current = true;
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (held.current) {
        held.current = false;
        releaseSlot();
      }
    };
  }, [url]);
  const done = () => {
    if (held.current) {
      held.current = false;
      releaseSlot();
    }
  };

  if (!visible || q.isPending || (url && !src))
    return (
      <div ref={box}>
        <Skeleton className="aspect-square w-full" />
      </div>
    );
  if (!q.data?.url)
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-canvas text-[12px] text-muted">
        <ImageOff className="size-5" aria-hidden />
        {q.data?.mode === 'stub' ? 'Dev stub' : 'Nahi khuli'}
      </div>
    );
  return (
    <a href={q.data.url} target="_blank" rel="noopener noreferrer" title="Bari photo kholen">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived URLs; next/image cannot optimise them */}
      <img src={src ?? q.data.url} alt={p.fileName} onLoad={done} onError={done} className="aspect-square w-full object-cover" />
    </a>
  );
}

export default function DeveloperPhotosPage() {
  const [route, setRoute] = React.useState<UploadRoute | ''>('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState<{ done: number; total: number } | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['developer', 'photos', route, from, to],
    queryFn: ({ pageParam }) => get<PhotoPage>('/developer/photos', { route: route || undefined, from: from || undefined, to: to || undefined, cursor: pageParam, limit: 24 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const photos = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  const one = async (p: Photo) => {
    setBusy(p.id);
    try {
      await downloadPhoto(p);
    } catch (e) {
      toast.error(e instanceof ApiError || e instanceof Error ? e.message : 'Download nahi hua');
    } finally {
      setBusy(null);
    }
  };

  /** Every photo matching the filters: loads the remaining pages, then saves them one by one. */
  const all = async () => {
    setBulk({ done: 0, total });
    let list = photos;
    let cursor = q.data?.pages[q.data.pages.length - 1]?.nextCursor ?? null;
    try {
      while (cursor) {
        const page: PhotoPage = await get<PhotoPage>('/developer/photos', { route: route || undefined, from: from || undefined, to: to || undefined, cursor, limit: 100 });
        list = [...list, ...page.items];
        cursor = page.nextCursor;
      }
      let failed = 0;
      for (const [i, p] of list.entries()) {
        try {
          await downloadPhoto(p);
        } catch {
          failed++;
        }
        setBulk({ done: i + 1, total: list.length });
        await new Promise((r) => setTimeout(r, 300)); // browsers drop downloads fired too fast
      }
      if (failed) toast.warning(`${list.length - failed} photos download hui, ${failed} nahi hui`);
      else toast.success(`${list.length} photos download ho gayi`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Photos ki list load nahi hui');
    } finally {
      setBulk(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        label="Developer"
        title="Photos"
        actions={
          <Button onClick={() => void all()} disabled={!total || !!bulk} loading={!!bulk}>
            <Download className="size-4" aria-hidden /> {bulk ? `${bulk.done}/${bulk.total}` : `Sab download karein (${total})`}
          </Button>
        }
      />
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kis cheez ki photo" htmlFor="ph-route">
            <Select id="ph-route" value={route} onChange={(e) => setRoute(e.target.value as UploadRoute | '')}>
              <option value="">Sab photos</option>
              {ROUTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kis tareekh se" htmlFor="ph-from">
            <Input id="ph-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Kis tareekh tak" htmlFor="ph-to">
            <Input id="ph-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {bulk && (
          <div className="mt-3">
            <Notice tone="info">Browser &ldquo;multiple downloads&rdquo; ki ijazat maange to Allow karein.</Notice>
          </div>
        )}
      </Card>

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : photos.length === 0 ? (
        <p className="text-dense text-muted">Aaj koi record nahi</p>
      ) : (
        <>
          <p className="text-dense text-muted">{total} photos</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                <Thumb p={p} />
                <div className="space-y-1 p-2 text-[12px]">
                  <p className="font-semibold text-ink">{routeLabel(p.route)}</p>
                  <p className="truncate text-muted" title={p.fileName}>
                    {p.fileName}
                  </p>
                  <p className="text-muted">
                    {p.uploadedBy ?? '—'}
                    {p.uploadedByRole ? ` · ${titleCase(p.uploadedByRole)}` : ''}
                  </p>
                  <p className="text-muted">{formatDateTime(p.createdAt)}</p>
                  <Button size="sm" variant="secondary" className="w-full" loading={busy === p.id} onClick={() => void one(p)}>
                    <Download className="size-4" aria-hidden /> Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Aur photos
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
