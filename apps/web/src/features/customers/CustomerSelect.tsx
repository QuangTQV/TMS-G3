import { useQuery } from '@tanstack/react-query';
import type { ChangeEvent } from 'react';
import { customersApi } from './api';

interface CustomerSelectProps {
  name?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (customerId: string) => void;
}

export function CustomerSelect({ name, required, defaultValue, value, onChange }: CustomerSelectProps) {
  const query = useQuery({
    queryKey: ['customers', 'select-options'],
    queryFn: () => customersApi.list(),
  });

  const controlledProps = onChange
    ? { value: value ?? '', onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
    : { defaultValue: defaultValue ?? '' };

  return (
    <select name={name} required={required} {...controlledProps}>
      <option value="" disabled>
        {query.isLoading ? 'Đang tải…' : 'Chọn khách hàng'}
      </option>
      {query.data?.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} — {c.legalName}
        </option>
      ))}
    </select>
  );
}
