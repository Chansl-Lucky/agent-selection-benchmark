// Matches the benchmark's case-level semantics. This module performs no API calls.
export function evaluateScenario(step, budget, deadline, selected) {
  const outcomes = Object.entries(step.candidates).map(([id, record]) => {
    const reasons = [];
    if (!record.native_pass) reasons.push('Native acceptance failed');
    if (record.cost_usd > budget) reasons.push('Budget exceeded');
    if (record.duration_seconds > deadline) reasons.push('Deadline exceeded');
    return {id, ...record, qualified: reasons.length === 0, reasons};
  });
  const feasible = outcomes.filter(x => x.qualified);
  const minCost = feasible.length ? Math.min(...feasible.map(x => x.cost_usd)) : null;
  for (const x of outcomes) {
    x.q = Number(x.qualified);
    x.e = !feasible.length ? null : !x.qualified ? 0 : x.cost_usd === 0 ? 1 : minCost / x.cost_usd;
  }
  return {outcomes, feasible: feasible.map(x => x.id), minCost, oracle: Number(feasible.length > 0),
    chosen: outcomes.find(x => x.id === selected) ?? null};
}

export function referenceScores(data, strategy) {
  let q = 0, e = 0, count = 0, eligible = 0;
  for (const step of data.steps) for (const b of data.budgets) for (const d of data.deadlines) {
    const r = evaluateScenario(step, b.value, d.value, strategy);
    count++;
    if (r.oracle) eligible++;
    if (strategy === 'oracle') {q += r.oracle; e += r.oracle;}
    else {q += r.chosen.q; e += r.chosen.e ?? 0;}
  }
  return {q: q / count, e: eligible ? e / eligible : 0, qualified_cases: q, main_cases: count, feasible_cases: eligible};
}
