export function getPreferredUserName(
  user: any,
  fallback: string = "Player",
): string {
  try {
    const candidates = [
      user?.profile?.displayName,
      user?.displayName,
      user?.name,
      user?.fullName,
      user?.profile?.fullName,
      user?.username,
      user?.profile?.username,
    ];
    for (const raw of candidates) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    }
  } catch {}
  return fallback;
}
