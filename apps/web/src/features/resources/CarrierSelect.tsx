import { useQuery } from '@tanstack/react-query';
import type { ChangeEvent } from 'react';
import { carriersApi } from './api';

interface CarrierSelectProps {
  name?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (carrierId: string) => void;
}

export function CarrierSelect({ name, required, defaultValue, value, onChange }: CarrierSelectProps) {
  const query = useQuery({
    queryKey: ['carriers', 'select-options'],
    queryFn: () => carriersApi.list(),
  });

  const controlledProps = onChange
    ? { value: value ?? '', onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
    : { defaultValue: defaultValue ?? '' };

  return (
    <select name={name} required={required} {...controlledProps}>
      <option value="" disabled>
        {query.isLoading ? 'Đang tải…' : 'Chọn nhà vận tải'}
      </option>
      {query.data?.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} — {c.legalName}
        </option>
      ))}
    </select>
  );
}
