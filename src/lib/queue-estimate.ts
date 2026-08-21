export interface WaitEstimate {
  minutes: number | null;
  available: boolean;
}

export function estimateWaitTime(
  ticketsAhead: number,
  avgServiceTimeSeconds: number | null
): WaitEstimate {
  if (ticketsAhead <= 0) {
    return { minutes: 0, available: true };
  }

  if (avgServiceTimeSeconds === null || avgServiceTimeSeconds <= 0) {
    return { minutes: null, available: false };
  }

  const totalSeconds = ticketsAhead * avgServiceTimeSeconds;
  const minutes = Math.max(1, Math.round(totalSeconds / 60));

  return { minutes, available: true };
}
