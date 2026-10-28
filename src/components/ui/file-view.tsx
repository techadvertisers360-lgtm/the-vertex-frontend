'use client';
import * as React from 'react';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, get } from '@/lib/api';
import { Button } from './button';

interface FileUrl {
  url: string | null;
  mode: 'public' | 'signed' | 'proxy' | 'stub';
  expiresInSec: number | null;
}

/**
 * Open an attachment. The backend checks role + record scope and answers with a short-lived signed URL
 * (private plan) or its own proxy URL (free plan) — never a permanent storage URL for clinical files (D-030).
 */
export function ViewFileButton({ attachmentId, label = 'View' }: { attachmentId: string; label?: string }) {
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    // Open the window synchronously (popup blockers), then point it at the authorized URL.
    const w = window.open('about:blank', '_blank', 'noopener=no');
    setBusy(true);
    try {
      const r = await get<FileUrl>(`/files/${attachmentId}/url`);
      if (!r.url) {
        w?.close();
        toast.info(r.mode === 'stub' ? 'Dev stub attachment — asli file store nahi hui.' : 'File available nahi.');
        return;
      }
      if (w) w.location.href = r.url;
      else window.location.href = r.url;
    } catch (e) {
      w?.close();
      toast.error(e instanceof ApiError ? e.message : 'File nahi khul saki.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" size="sm" variant="secondary" onClick={() => void open()} loading={busy}>
      <Eye className="size-4" /> {label}
    </Button>
  );
}
