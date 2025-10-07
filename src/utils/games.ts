export const freeGames = ['X01', 'Double Practice'] as const
export const premiumGames = ['Around the Clock', 'Cricket', 'Halve It', 'Shanghai', 'High-Low', 'Killer'] as const
export type GameKey = typeof freeGames[number] | typeof premiumGames[number]
export const allGames: GameKey[] = [...freeGames, ...premiumGames]
