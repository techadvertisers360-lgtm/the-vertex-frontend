'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth-layout';
import { InstallApp } from '@/components/install-app';
import { Button } from '@/components/ui/button';
import { Field, Input, Notice } from '@/components/ui/form';
import { MESSAGES } from '@/components/ui/states';
import { ApiError, post } from '@/lib/api';
import type { Me } from '@/lib/types';

const schema = z.object({
  identifier: z.string().trim().min(3, 'Email, phone ya Member ID likhein'),
  password: z.string().min(1, 'Password likhein'),
});
type Values = z.infer<typeof schema>;

const REASONS: Record<string, { tone: 'warning' | 'danger' | 'info'; text: string }> = {
  expired: { tone: 'warning', text: MESSAGES.sessionExpired },
  disabled: { tone: 'danger', text: MESSAGES.accountDisabled },
  'signed-out': { tone: 'info', text: 'Aap sign out ho gaye.' },
  reset: { tone: 'info', text: 'Password badal gaya. Naye password se sign in karein.' },
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const reason = REASONS[params.get('reason') ?? ''];
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const me = await post<Me>('/auth/login', v);
      qc.setQueryData(['me'], me);
      const next = params.get('next');
      // Only follow `next` inside this role's area, or a tapped phone notification (/n/<id>, D-046).
      router.replace(next && (next.startsWith(me.home) || /^\/n\/[\w-]+$/.test(next)) ? next : me.home);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign in nahi ho saka.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {reason && <Notice tone={reason.tone}>{reason.text}</Notice>}
      {error && <Notice>{error}</Notice>}
      <Field label="Email, phone ya Member ID" required error={formState.errors.identifier?.message} htmlFor="identifier">
        <Input id="identifier" autoComplete="username" autoFocus placeholder="e.g. LM-001" aria-invalid={!!formState.errors.identifier} {...register('identifier')} />
      </Field>
      <Field label="Password" required error={formState.errors.password?.message} htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />
      </Field>
      <Button type="submit" className="w-full" loading={formState.isSubmitting}>
        Sign in
      </Button>
      <p className="text-center text-dense text-muted">Password bhool gaye? Clinic administrator se rabta karein.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout title="Sign in" aside={<InstallApp />}>
      <React.Suspense>
        <LoginForm />
      </React.Suspense>
    </AuthLayout>
  );
}
