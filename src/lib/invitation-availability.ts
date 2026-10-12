/** A null send time represents an immediate/legacy invitation; future schedules remain hidden. */
export function invitationAvailable(sendAt: string | null | undefined, now = Date.now()): boolean {
  return sendAt == null || Date.parse(sendAt) <= now;
}
