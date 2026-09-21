export const MAX_PACKET_BYTES = 256 * 1024;
export const MAX_JSON_INPUT_BYTES = MAX_PACKET_BYTES + 64 * 1024;
export const HORIZONS = Object.freeze([
  { id: '12h', label: '12 hours', hours: 12 },
  { id: '24h', label: '24 hours', hours: 24 },
  { id: '3d', label: '3 days', hours: 72 },
  { id: '7d', label: '7 days', hours: 168 },
]);
export const SCENARIOS = Object.freeze(['Bear', 'Base', 'Bull']);
export const REVIEW_ASSERTIONS = Object.freeze([
  { id: 'authority', label: 'Research-only authority boundary' },
  { id: 'evidence', label: 'Source provenance and cutoff' },
  { id: 'scenarios', label: 'Scenario math and method' },
  { id: 'liquidity', label: 'Liquidity and permanent-loss risk' },
  { id: 'invalidation', label: 'Countercase and invalidation' },
]);
