'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/form';
import { uploadFileTo } from '@/components/ui/upload';

/** The patient signs on the screen; the signature is saved as the signed consent form (D-089). */
export function SignaturePad({ recordId, onSaved }: { recordId: string; onSaved: (attachmentId: string) => void }) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [signed, setSigned] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const clear = React.useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    setSigned(false);
  }, []);
  React.useEffect(clear, [clear]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setSigned(true);
  };
  const save = async () => {
    const c = canvas.current;
    if (!c) return;
    setBusy(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const id = await uploadFileTo('consentForm', new File([blob], 'patient-signature.png', { type: 'image/png' }), { recordType: 'ProcedureTask', recordId });
      onSaved(id);
    } catch {
      setError('Signature save nahi hui. Dobara koshish karein.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-dense text-muted">Ya patient yahan screen par sign kare:</p>
      <canvas ref={canvas} width={600} height={200} aria-label="Patient signature" onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} className="h-40 w-full touch-none rounded-card border border-line" />
      {error && <Notice>{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!signed} loading={busy} onClick={() => void save()}>Save signature as consent form</Button>
        <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
      </div>
    </div>
  );
}
