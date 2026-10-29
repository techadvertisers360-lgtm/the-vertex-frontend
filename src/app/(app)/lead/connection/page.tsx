'use client';
import * as React from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { BookingDialog } from '@/components/lead/booking-dialog';

/**
 * Connection booking (D-071): the member books someone from their own contacts — no lead sheet. Name + phone,
 * Doctor, then a free slot from the Doctor's availability; the booking lands in the member's Appointments.
 */
export default function ConnectionBookingPage() {
  const [open, setOpen] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [booked, setBooked] = React.useState(0);
  return (
    <div className="space-y-4">
      <PageHeader label="Lead Team" title="Connection Booking" />
      <Card>
        <CardHeader>
          <CardTitle>Apne connection ki booking</CardTitle>
        </CardHeader>
        <div className="space-y-3 text-dense text-muted">
          <p>Patient ka naam aur phone likhein, Doctor chunein, available timing dekhein aur booking confirm karein. Patient aur Doctor ko booking details khud chali jayengi.</p>
          {booked > 0 && (
            <p className="text-ink">
              Is session mein {booked} booking ho gayi —{' '}
              <Link href="/lead/appointments?bucket=total" className="font-semibold text-brand-medium hover:underline">
                Appointments mein dekhein
              </Link>
            </p>
          )}
          <Button
            onClick={() => {
              setRound((r) => r + 1);
              setOpen(true);
            }}
          >
            <CalendarPlus className="size-4" aria-hidden /> Nayi booking
          </Button>
        </div>
      </Card>
      {open && <BookingDialog key={round} open={open} onOpenChange={setOpen} onBooked={() => setBooked((n) => n + 1)} />}
    </div>
  );
}
