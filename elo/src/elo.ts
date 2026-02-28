const K = 32;

export interface EloResult {
  newWinnerElo: number;
  newLoserElo: number;
}

export function calculateElo(winnerElo: number, loserElo: number): EloResult {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const newWinnerElo = winnerElo + K * (1 - expected);
  const newLoserElo = loserElo + K * (0 - (1 - expected));
  return { newWinnerElo, newLoserElo };
}
