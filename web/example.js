import { blankPacket, endAt, HORIZONS, REVIEW_ASSERTIONS } from './packet.js';

export function examplePacket() {
  const packet = blankPacket();
  packet.kind = 'synthetic';
  packet.preparedBy = 'Example researcher';
  packet.asset = { symbol: 'DEMO', name: 'Demonstration asset', quoteCurrency: 'USD', venue: 'Fictional reference venue' };
  packet.reference = { price: 100, capturedAt: '2026-08-20T09:00:00Z', timezone: 'UTC' };
  packet.thesis = 'A fictional network upgrade could increase use. This packet demonstrates how to organize a thesis, competing evidence, and bounded scenarios. It is not a market view.';
  packet.disconfirmingEvidence = 'In this example, activity does not increase after the upgrade. A price move without a matching change in use would weaken the thesis.';
  packet.invalidation = 'The fictional upgrade is canceled, or the assumed increase in network activity is absent at the next review.';
  packet.liquidity = 'No real liquidity was measured. Market depth, venue access, spreads, and concentration would require dated primary evidence in an actual packet.';
  packet.risks = ['An upgrade can fail or be delayed.', 'Prices can move independently of network use.', 'A structured forecast can still be wrong.'];
  packet.unknowns = ['All values are fictional. No predictive accuracy or calibration is established.'];
  packet.method = {
    basis: 'judgmental', description: 'Illustrative scenario construction for testing the workbench, not a fitted forecasting model.',
    sourceWindow: 'Synthetic observations dated 20-08-2026.', observationFrequency: 'Not applicable to this synthetic example.',
    sampleSize: null, transformations: 'Returns are calculated as (threshold / reference price - 1) × 100.',
    regimeAdjustment: 'None. No real market regime is asserted.', eventAssumptions: 'A fictional upgrade remains scheduled.',
    limitations: 'No backtest, calibration, or live observations. The example cannot support a financial decision.',
  };
  packet.sources = [{
    id: 'example-upgrade', title: 'Synthetic upgrade announcement', url: 'https://example.com/upgrade',
    type: 'primary', publishedAt: '2026-08-20T07:00:00Z', capturedAt: '2026-08-20T08:30:00Z',
    claim: 'A fictional upgrade is scheduled. This is sample content, not a claim about a real protocol.',
    excerpt: 'Synthetic excerpt: the demonstration network plans an upgrade.',
  }, {
    id: 'example-activity', title: 'Synthetic activity observation', url: 'https://example.org/activity',
    type: 'primary', publishedAt: '2026-08-20T08:00:00Z', capturedAt: '2026-08-20T08:45:00Z',
    claim: 'Activity is unchanged in the fictional observation window.',
    excerpt: 'Synthetic excerpt: no change in demonstration network activity was observed.',
  }];
  const thresholds = [[94, 106], [90, 112], [84, 121], [74, 138]];
  const probabilities = [[25, 50, 25], [30, 45, 25], [30, 40, 30], [35, 35, 30]];
  packet.horizons = HORIZONS.map((horizon, index) => ({
    id: horizon.id, endAt: endAt(packet.reference.capturedAt, horizon.hours), status: 'complete', gapReason: '',
    scenarios: ['Bear', 'Base', 'Bull'].map((label, scenarioIndex) => ({
      label, lower: [0, thresholds[index][0], thresholds[index][1]][scenarioIndex],
      upper: [thresholds[index][0], thresholds[index][1], null][scenarioIndex],
      probability: probabilities[index][scenarioIndex],
      driver: ['Upgrade delay or weaker use.', 'No material change in the fictional evidence.', 'Upgrade completion with stronger use.'][scenarioIndex],
      trigger: ['A cancellation is reported.', 'Activity stays within the assumed range.', 'The assumed activity increase is observed.'][scenarioIndex],
      invalidation: ['The upgrade completes and use increases.', 'A material upside or downside event occurs.', 'Use fails to increase after the upgrade.'][scenarioIndex],
      confidence: 'low',
    })),
  }));
  packet.riskReview = {
    status: 'deliver_with_warning', reviewer: 'Example reviewer', reviewedAt: '2026-08-20T09:15:00Z',
    notes: 'Fictional review for an interface example only. No real evidence, reviewer identity, or investment conclusion has been verified.',
    sourceIds: ['example-upgrade', 'example-activity'],
    assertions: REVIEW_ASSERTIONS.map(assertion => ({
      id: assertion.id, result: 'WARN', severity: 'high',
      evidence: 'Synthetic review assertion for the fictional example. No real evidence has been checked.',
      repair: 'Replace all fictional inputs and obtain an actual independent review before using real research.',
    })),
  };
  return packet;
}
