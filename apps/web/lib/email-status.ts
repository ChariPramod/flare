export function deliveryLabel(status: string) {
  return (
    {
      queued: 'Accepted',
      sent: 'Provider accepted',
      delivered: 'Delivered',
      held: 'On hold',
      delivery_delayed: 'Delivery delayed',
    }[status] ?? status.replaceAll('_', ' ')
  );
}

/** Provider acceptance is an intermediate outcome, separate from delivery. */
export function deliveryTone(status: string) {
  return status === 'sent' ? 'accepted' : status;
}
