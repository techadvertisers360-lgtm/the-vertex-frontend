import Link from 'next/link';
import { AuthLayout } from '@/components/auth-layout';
import { Notice } from '@/components/ui/form';

/**
 * Self-service password reset is off (D-044): passwords are issued and changed only by the administrator.
 * Old /forgot-password and /reset-password links land here.
 */
export function PasswordAdminOnly() {
  return (
    <AuthLayout title="Password" subtitle="Password sirf administrator set ya badal sakta hai.">
      <div className="space-y-4">
        <Notice tone="info">Password bhool gaye hain ya badalna hai? Clinic administrator se rabta karein — woh aap ko naya password denge.</Notice>
        <Link href="/login" className="block text-center text-dense font-semibold text-brand-medium hover:underline">
          Sign in par wapas
        </Link>
      </div>
    </AuthLayout>
  );
}
