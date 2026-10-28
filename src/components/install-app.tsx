'use client';
import * as React from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Install in your phone" (PWA). Android / Chrome / Edge: the browser's own install prompt. iPhone / iPad (Safari has
 * no prompt): step-by-step "Add to Home Screen". Hidden once the app is already running installed.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function InstallApp() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [state, setState] = React.useState<'unknown' | 'installed' | 'ios' | 'other'>('unknown');
  const [help, setHelp] = React.useState(false);

  React.useEffect(() => {
    setState(isInstalled() ? 'installed' : isIOS() ? 'ios' : 'other');
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our button
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setState('installed');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state === 'unknown' || state === 'installed') return null;

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setState('installed');
      setPrompt(null);
    } else {
      setHelp((v) => !v);
    }
  };

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-light text-brand">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">Install in your phone</p>
          <p className="text-dense text-muted">Android ya iPhone ki home screen par app ki tarah kholein.</p>
        </div>
        <Button size="sm" onClick={() => void install()} aria-expanded={prompt ? undefined : help}>
          <Download className="size-4" /> Install
        </Button>
      </div>
      {help && !prompt && (
        <ol className="mt-3 list-decimal space-y-1 border-t border-line pt-3 pl-5 text-dense text-ink">
          {state === 'ios' ? (
            <>
              <li>
                Safari mein neeche <Share className="inline size-4 align-text-bottom" aria-label="Share" /> <b>Share</b> button dabayein.
              </li>
              <li>
                <b>Add to Home Screen</b> chunein.
              </li>
              <li>
                Upar <b>Add</b> dabayein — The Vertex Health ka icon home screen par aa jayega.
              </li>
            </>
          ) : (
            <>
              <li>
                Chrome mein upar <b>⋮</b> (menu) dabayein.
              </li>
              <li>
                <b>Install app</b> ya <b>Add to Home screen</b> chunein.
              </li>
              <li>
                <b>Install</b> dabayein — icon home screen par aa jayega.
              </li>
            </>
          )}
        </ol>
      )}
    </div>
  );
}
