/** Blind submission: hide others until current user has saved at least once. */

export const BLIND_GATE_MESSAGE =
  'Save your availability to see how everyone else responded.';

export function shouldBlindOthers(participant) {
  return !participant?.has_submitted_availability;
}

/**
 * Strip other participants' slots from UI data until blind gate unlocks.
 * @param {Array} slots
 * @param {{ id: string, has_submitted_availability?: boolean } | null} participant
 */
export function filterSlotsForViewer(slots, participant) {
  if (!shouldBlindOthers(participant)) return slots;
  if (!participant) return [];
  return slots.filter((s) => s.participant_id === participant.id);
}
