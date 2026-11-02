'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { ActError, Loaded, useAct } from './common';

/** Staff chat by room (D-089). MD and Hamza Zafar can read every room. Messages are kept, never deleted. */
export function ChatPage() {
  const rooms = useQuery({ queryKey: ['ops', 'chat-rooms'], queryFn: () => get<{ rooms: { id: string; name: string }[] }>('/ops/chat/rooms') });
  const [room, setRoom] = React.useState('');
  const current = room || rooms.data?.rooms[0]?.id || '';
  const messages = useQuery({ queryKey: ['ops', 'chat', current], queryFn: () => get<{ items: { id: string; body: string; createdAt: string; sender: string | null; mine: boolean }[] }>(`/ops/chat/${current}`), enabled: !!current, refetchInterval: 15_000 });
  const [text, setText] = React.useState('');
  const send = useAct(() => post(`/ops/chat/${current}`, { body: text.trim() }), undefined, () => setText(''));
  return (
    <div className="space-y-3">
      <PageHeader label="Team" title="Chat" />
      <Loaded q={rooms} empty={(d) => d.rooms.length === 0} emptyTitle="Aap ke liye koi chat room nahi">
        {(d) => (
          <>
            <Segmented value={current} onChange={setRoom} options={d.rooms.map((r) => ({ value: r.id, label: r.name }))} />
            <Card>
              <Loaded q={messages}>
                {(m) => (m.items.length === 0 ? <EmptyState title="Abhi koi message nahi" /> : (
                  <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
                    {m.items.map((x) => (
                      <li key={x.id} className={cn('max-w-[85%] rounded-card border border-line p-2 text-dense', x.mine ? 'ml-auto bg-brand-light' : 'bg-surface')}>
                        <p className="font-semibold text-ink">{x.sender}</p>
                        <p className="whitespace-pre-wrap break-words text-ink">{x.body}</p>
                        <p className="text-[12px] text-muted">{formatDateTime(x.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                ))}
              </Loaded>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) send.mutate(undefined);
                }}
              >
                <Input aria-label="Write a message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message likhein" />
                <Button type="submit" disabled={!text.trim()} loading={send.isPending}>Send</Button>
              </form>
              <p className="mt-1 text-[12px] text-muted">Hamza Zafar aur MD sab chats parh sakte hain.</p>
              <ActError error={send.error} />
            </Card>
          </>
        )}
      </Loaded>
    </div>
  );
}
