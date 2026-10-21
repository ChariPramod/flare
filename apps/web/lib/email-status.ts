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
