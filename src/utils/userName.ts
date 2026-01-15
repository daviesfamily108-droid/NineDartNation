export function getPreferredUserName(
  user: any,
  fallback: string = "Player",
): string {
  try {
    const candidates = [
      user?.username,
      user?.profile?.username,
      user?.profile?.fullName,
      user?.fullName,
      user?.profile?.displayName,
      user?.displayName,
      user?.name,
    ];
    for (const raw of candidates) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    }
  } catch {}
  return fallback;
}
