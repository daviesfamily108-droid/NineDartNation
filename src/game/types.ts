export type DartMult = 'S' | 'D' | 'T'
export type Dart = { mult: DartMult; num: number } | { bull: 25 | 50 }

export type DoublePracticeState = {
	targetIndex: number // 0..20 for D1..D20 then 21 for DBULL
	completed: boolean
}

export const DOUBLE_PRACTICE_TARGETS: Array<{ label: string; score: number; isBull?: boolean }>[] = [] as any

export const DOUBLE_PRACTICE_ORDER: { label: string; score: number; isBull?: boolean }[] = [
	...Array.from({ length: 20 }, (_, i) => ({ label: `D${i + 1}` , score: (i + 1) * 2 })),
	{ label: 'DBULL', score: 50, isBull: true },
]

export function isDoubleHit(value: number, targetIdx: number): boolean {
	const t = DOUBLE_PRACTICE_ORDER[targetIdx]
	return !!t && value === t.score
}

export function parseManualDart(input: string): number | null {
	const t = input.trim().toUpperCase()
	if (!t) return null
	if (t === '50' || t === 'BULL' || t === 'DBULL' || t === 'IBULL') return 50
	if (t === '25' || t === 'OBULL') return 25
	const m = t.match(/^(S|D|T)?\s*(\d{1,2})$/)
	if (!m) return null
	const mult = (m[1] || 'S') as 'S'|'D'|'T'
	const num = parseInt(m[2],10)
	if (num < 1 || num > 20) return null
	const multVal = mult==='S'?1:mult==='D'?2:3
	return num * multVal
}
