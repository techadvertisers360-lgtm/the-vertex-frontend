'use client';
import * as React from 'react';
import { Button } from './button';
import { Input, Select } from './form';

const NEW_VALUE = '__new__';

/** A real dropdown of the saved values plus "+ Naya likhein…", which switches to a text box (and back). */
export function ChoiceField({ value, onChange, id, options }: { value: string; onChange: (v: string) => void; id: string; options: string[] }) {
  const [typing, setTyping] = React.useState(() => !!value && !options.includes(value));
  if (typing || options.length === 0)
    return (
      <div className="flex gap-2">
        <Input id={id} autoFocus={typing} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Naya likhein" />
        {options.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setTyping(false);
              if (!options.includes(value)) onChange('');
            }}
          >
            List
          </Button>
        )}
      </div>
    );
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW_VALUE) {
          setTyping(true);
          onChange('');
        } else onChange(e.target.value);
      }}
    >
      <option value="">— Chunein —</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={NEW_VALUE}>+ Naya likhein…</option>
    </Select>
  );
}
