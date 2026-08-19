const TONE_BY_KEYWORD: Array<{ match: RegExp; tone: string }> = [
  { match: /VERIFIED|CONFIRMED|ACTIVE|VERIFIED|COMPLETED_VERIFIED|LOCKED|SIGNED|DISPATCHED/, tone: 'good' },
  { match: /DRAFT|PENDING|QUEUED|PROCESSING|PLANNED/, tone: 'neutral' },
  { match: /NEEDS_REVIEW|HELD|PAUSED|EXCEPTION/, tone: 'warn' },
  { match: /REJECTED|CANCELLED|FAILED|LOCKED_OUT|TERMINATED|EXPIRED/, tone: 'bad' },
];

function toneFor(status: string): string {
  return TONE_BY_KEYWORD.find((t) => t.match.test(status))?.tone ?? 'neutral';
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${toneFor(status)}`}>{status}</span>;
}
