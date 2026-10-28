'use client';
import { PageHeader } from '@/components/ui/card';
import { PushSettings } from '@/components/push-settings';

/** Every user's phone-notification settings for the device they are on (D-046). */
export default function NotificationSettingsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader label="Profile" title="Phone notifications" />
      <PushSettings />
    </div>
  );
}
