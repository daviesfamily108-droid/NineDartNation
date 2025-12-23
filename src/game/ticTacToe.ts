export type TicCell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Map grid cells to targets: center uses Bull; edges/corners use numbers.
export const TTT_TARGETS: Record<
  TicCell,
  { type: "NUM" | "BULL"; num?: number }
> = {
  0: { type: "NUM", num: 20 },
  1: { type: "NUM", num: 19 },
  2: { type: "NUM", num: 18 },
  3: { type: "NUM", num: 17 },
  4: { type: "BULL" },
  5: { type: "NUM", num: 16 },
  6: { type: "NUM", num: 15 },
  7: { type: "NUM", num: 14 },
  8: { type: "NUM", num: 13 },
};

export type TicTacToeState = {
  board: Array<"X" | "O" | null>;
  turn: "X" | "O";
  finished: boolean;
  winner: "X" | "O" | "Draw" | null;
};

export function createTicTacToe(): TicTacToeState {
  return {
    board: Array(9).fill(null),
    turn: "X",
    finished: false,
    winner: null,
  };
}

function checkWin(board: Array<"X" | "O" | null>): "X" | "O" | "Draw" | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return board[a] as "X" | "O";
  }
  if (board.every((c) => c)) return "Draw";
  return null;
}

export function tryClaimCell(
  state: TicTacToeState,
  cell: TicCell,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
): boolean {
  if (state.finished || state.board[cell]) return false;
  const tgt = TTT_TARGETS[cell];
  let ok = false;
  if (tgt.type === "BULL")
    ok =
      ring === "BULL" || ring === "INNER_BULL" || value === 25 || value === 50;
  else if (tgt.type === "NUM" && typeof tgt.num === "number") {
    if (typeof sector === "number" && sector === tgt.num) ok = true;
    else if (
      !sector &&
      (value === tgt.num || value === tgt.num * 2 || value === tgt.num * 3)
    )
      ok = true;
  }
  if (!ok) return false;
  state.board[cell] = state.turn;
  const w = checkWin(state.board);
  if (w) {
    state.finished = true;
    state.winner = w;
    return true;
  }
  state.turn = state.turn === "X" ? "O" : "X";
  return true;
}
