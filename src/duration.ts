/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * Examples:
 *   - 0       → "0s"
 *   - 1000    → "1s"
 *   - 60000   → "1m 0s"
 *   - 3661000 → "1h 1m 1s"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${seconds}s`;
}
