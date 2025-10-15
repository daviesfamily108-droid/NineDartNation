export const freeGames = ['X01', 'Double Practice'] as const
export const premiumGames = [
	'Around the Clock',
	'Cricket',
	'Halve It',
	'Shanghai',
	'High-Low',
	'Killer',
	"Bob's 27",
	'Count-Up',
	'High Score',
	'Low Score',
	'Checkout 170',
	'Checkout 121',
	'Treble Practice',
	'Baseball',
	'Golf',
	'Tic Tac Toe',
	'American Cricket',
] as const
export type GameKey = typeof freeGames[number] | typeof premiumGames[number]
export const allGames: GameKey[] = [...freeGames, ...premiumGames]
