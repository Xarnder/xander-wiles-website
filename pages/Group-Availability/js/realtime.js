export function subscribeToEvent(eventId, client, handlers) {
  const channel = client
    .channel(`wth-event-${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'availability_slots', filter: `event_id=eq.${eventId}` },
      () => handlers.onSlots?.()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_participants', filter: `event_id=eq.${eventId}` },
      () => handlers.onParticipants?.()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
      (payload) => handlers.onEvent?.(payload.new)
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
