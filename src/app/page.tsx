'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ApiError, get } from '@/lib/api';
import type { Me } from '@/lib/types';
import { Splash } from '@/components/shell/splash';

/** Role-based redirect: send the user to their role home, or to sign-in. */
export default function Root() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/me'), retry: false });
  React.useEffect(() => {
    if (q.data) router.replace(q.data.home);
    else if (q.error instanceof ApiError && q.error.status === 401) router.replace('/login');
  }, [q.data, q.error, router]);
  return <Splash />;
}
