#!/usr/bin/env node
// Offline consistency audit for the current public eight-selector score snapshot.
// Run from any directory: node project_site/scripts/check_scores.mjs
// Reads only exported data and scoring.js; writes review/scoring_audit.json.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const report = {
  audit: 'public_export_and_browser_scoring',
  generated_at: new Date().toISOString(),
  mode: 'offline; no API requests or original task executions',
  inputs: {}, checks: [], reference_scores: [],
};
async function read(relative) {
  const text = await readFile(new URL(relative, root), 'utf8');
  report.inputs[relative] = {sha256: createHash('sha256').update(text).digest('hex')};
  return text;
}
function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: non-finite value`);
  assert.ok(Math.abs(actual - expected) <= 1e-12, `${label}: ${actual} != ${expected}`);
}
function unit(value, label) {
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${label}: outside [0, 1]`);
}
function check(name, fn) {
  try { const detail = fn(); report.checks.push({name, status: 'pass', detail}); }
  catch (error) { report.checks.push({name, status: 'fail', error: error.message}); }
}

try {
  const benchmark = JSON.parse(await read('data/benchmark.json'));
  const scicode = JSON.parse(await read('data/scicode66.json'));
  const analysis = JSON.parse(await read('data/analysis.json'));
  const moduleText = await read('scoring.js');
  // This works without changing package.json to type=module.
  const {evaluateScenario, referenceScores} = await import(
    `data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`
  );
  const expected = {benchmark_count: 9, source_tasks: 1116, task_packs: 1180,
    main_cases: 22240, feasible_cases: 11589, all_fail_cases: 10651, formal_models: 8};

  check('fixed_snapshot_totals_and_unique_rows', () => {
    assert.equal(benchmark.meta.version, 'complete_eight_model_cohort_20261110');
    for (const [key, value] of Object.entries(expected)) assert.equal(benchmark.meta[key], value, key);
    assert.equal(benchmark.models.length, 8);
    assert.equal(benchmark.benchmarks.length, 9);
    assert.equal(benchmark.scores.length, 80);
    assert.equal(new Set(benchmark.models.map(x => x.id)).size, 8);
    assert.equal(new Set(benchmark.benchmarks.map(x => x.id)).size, 9);
    const keys = benchmark.scores.map(x => `${x.model}/${x.benchmark}`);
    assert.equal(new Set(keys).size, 80, 'duplicate model/benchmark rows');
    for (const model of benchmark.models) for (const id of ['ALL', ...benchmark.benchmarks.map(x => x.id)]) {
      assert.ok(keys.includes(`${model.id}/${id}`), `missing ${model.id}/${id}`);
    }
    for (const key of ['source_tasks', 'task_packs', 'main_cases', 'feasible_cases']) {
      assert.equal(benchmark.benchmarks.reduce((sum, b) => sum + b[key], 0), expected[key], key);
    }
    assert.equal(expected.feasible_cases + expected.all_fail_cases, expected.main_cases);
    assert.equal(benchmark.meta.partial_models_in_main_ranking, false);
    assert.equal(benchmark.meta.common_task_cohort, true);
    assert.equal(benchmark.meta.recorded_selector_packages, 9440);
    assert.equal(benchmark.meta.valid_submissions, 9266);
    assert.equal(benchmark.meta.invalid_submissions, 174);
    assert.equal(benchmark.scores.filter(r => r.benchmark === 'ALL').reduce((s, r) => s + r.invalid_submissions, 0), 174);
    return {...expected, summary_rows: 80};
  });

  check('score_ranges_denominators_and_oracle', () => {
    assert.equal(benchmark.meta.score_scale, 'fraction_0_1');
    for (const row of benchmark.scores) {
      const key = `${row.model}/${row.benchmark}`;
      for (const metric of ['q', 'e', 'oracle', 'feasible_hit_rate', 'h']) unit(row[metric], `${key}.${metric}`);
      if (row.h === 0) { assert.equal(row.c, null); assert.equal(row.e, 0); }
      else { unit(row.c, `${key}.c`); close(row.e, row.h * row.c, `${key}.E=H*C`); }
      assert.ok(row.q <= row.oracle + 1e-12, `${key}: Q exceeds oracle`);
      assert.equal(row.valid_submissions + row.invalid_submissions, row.task_packs, `${key}: submissions`);
      assert.equal(row.feasible_cases + row.all_fail_cases, row.main_cases, `${key}: cases`);
      const scope = row.benchmark === 'ALL' ? expected : benchmark.benchmarks.find(b => b.id === row.benchmark);
      assert.ok(scope, `${key}: unknown benchmark`);
      for (const count of ['task_packs', 'main_cases', 'feasible_cases']) assert.equal(row[count], scope[count], `${key}.${count}`);
      if (row.benchmark !== 'ALL') close(row.oracle, scope.oracle, `${key}.oracle`);
    }
    return {rows_checked: benchmark.scores.length, stored_scale: 'fraction_0_1'};
  });

  check('overall_q_oracle_pack_macro_and_e_feasible_case_weighted', () => {
    for (const model of benchmark.models) {
      const overall = benchmark.scores.find(x => x.model === model.id && x.benchmark === 'ALL');
      const parts = benchmark.scores.filter(x => x.model === model.id && x.benchmark !== 'ALL');
      for (const metric of ['q', 'oracle']) {
        close(overall[metric], parts.reduce((sum, r) => sum + r[metric] * r.task_packs, 0) / overall.task_packs,
          `${model.id}.${metric}`);
      }
      close(overall.e, parts.reduce((sum, r) => sum + r.e * r.feasible_cases, 0) / overall.feasible_cases,
        `${model.id}.e`);
      for (const count of ['valid_submissions', 'invalid_submissions', 'all_fail_cases']) {
        assert.equal(overall[count], parts.reduce((sum, r) => sum + r[count], 0), `${model.id}.${count}`);
      }
    }
    return {models_checked: 8, q_and_oracle: 'pack weighted across benchmarks', e: 'feasible-case weighted'};
  });

  check('all_96_scenarios_and_null_efficiency_for_all_fail', () => {
    assert.equal(scicode.steps.length, 6);
    assert.equal(scicode.budgets.length, 4);
    assert.equal(scicode.deadlines.length, 4);
    let total = 0, feasible = 0, allFail = 0;
    for (const step of scicode.steps) for (const budget of scicode.budgets) for (const deadline of scicode.deadlines) {
      const result = evaluateScenario(step, budget.value, deadline.value, 'zero');
      const accepted = Object.entries(step.candidates).filter(([, c]) =>
        c.native_pass === true && c.cost_usd <= budget.value && c.duration_seconds <= deadline.value);
      assert.deepEqual(result.feasible.slice().sort(), accepted.map(([id]) => id).sort());
      assert.equal(result.oracle, Number(accepted.length > 0));
      total++;
      if (accepted.length) feasible++; else allFail++;
      const minCost = accepted.length ? Math.min(...accepted.map(([, c]) => c.cost_usd)) : null;
      for (const outcome of result.outcomes) {
        assert.equal(outcome.q, Number(accepted.some(([id]) => id === outcome.id)));
        if (!accepted.length) assert.equal(outcome.e, null, 'all-fail scenario must be excluded from E');
        else close(outcome.e, outcome.q ? (outcome.cost_usd === 0 ? 1 : minCost / outcome.cost_usd) : 0, 'case efficiency');
      }
    }
    assert.equal(total, 96); assert.equal(feasible, 22); assert.equal(allFail, 74);
    return {main_cases: total, feasible_cases: feasible, all_fail_excluded_from_e: allFail};
  });

  check('three_full_reference_submissions_match_native_export', () => {
    for (const strategy of ['zero', 'tools', 'oracle']) {
      const actual = referenceScores(scicode, strategy);
      const saved = scicode.reference_scores.find(x => x.strategy === strategy);
      assert.ok(saved, `missing reference ${strategy}`);
      for (const key of ['q', 'e', 'qualified_cases', 'main_cases', 'feasible_cases']) close(actual[key], saved[key], `${strategy}.${key}`);
      report.reference_scores.push({strategy, ...actual});
    }
    return {strategies: 3, cases_per_strategy: 96, tolerance: 1e-12};
  });

  check('history_cards_exclude_target_and_held_out_fold', () => {
    assert.equal(scicode.not_router_visible_ground_truth, true);
    assert.ok(!scicode.history_folds.includes(scicode.held_out_fold));
    assert.ok(scicode.history_cards.length > 0, 'history evidence missing');
    assert.equal(new Set(scicode.history_cards.map(x => x.source_task_key)).size, scicode.history_cards.length);
    for (const card of scicode.history_cards) {
      assert.notEqual(card.source_task_key, scicode.source_task_key, 'target present in history cards');
      assert.notEqual(card.fold, scicode.held_out_fold, 'held-out fold present in history cards');
      assert.ok(scicode.history_folds.includes(card.fold), 'history card outside allowed folds');
    }
    return {target: scicode.source_task_key, held_out_fold: scicode.held_out_fold,
      history_cards: scicode.history_cards.map(c => ({source_task_key: c.source_task_key, fold: c.fold})),
      scope: 'exported demonstration cards; does not inspect the full private history corpus'};
  });

  check('paper_diagnostics_match_formal_scores', () => {
    assert.equal(analysis.meta.version, benchmark.meta.version);
    assert.equal(analysis.model_diagnostics.length, 8);
    for (const row of analysis.model_diagnostics) {
      const overall = benchmark.scores.find(r => r.model === row.model && r.benchmark === 'ALL');
      assert.ok(overall);
      for (const metric of ['q', 'e', 'h', 'c']) close(row[metric], overall[metric], `${row.model}.${metric}`);
      close(row.adaptation_gain_pp, (row.q - row.baseline_repeated_q) * 100, 'adaptation gain in percentage points');
      assert.equal(row.required_groups, 114);
      assert.ok(row.required_group_switches <= row.required_valid_groups);
      assert.ok(row.all_feasible_success <= row.required_groups);
      assert.equal(row.regression_native + row.regression_resource, row.regressions);
      close(row.regression_rate, row.regressions / row.regression_opportunities, 'regression rate');
    }
    assert.equal(analysis.highlights.best_all_feasible_success, 9);
    assert.equal(analysis.highlights.regressions, 4189);
    assert.equal(analysis.highlights.regression_native, 3161);
    assert.equal(analysis.highlights.regression_resource, 1028);
    assert.equal(analysis.consistency.counts.invalid_submission_packages, 174);
    return {models_checked: 8, regressions: 4189, best_full_coverage: '9/114'};
  });

  check('switching_categories_exhaust_groups_without_vacuous_success', () => {
    const {categories, counts, category_models: rows} = analysis.switching;
    assert.equal(categories.length, 4);
    assert.equal(rows.length, 32);
    assert.equal(categories.reduce((s, c) => s + c.groups, 0), 1390);
    assert.equal(categories.reduce((s, c) => s + c.profiles, 0), 22240);
    assert.equal(categories.reduce((s, c) => s + c.feasible_profiles, 0), 11589);
    assert.equal(counts.feasible_groups, 940);
    assert.equal(counts.satisfaction_switch_required_groups, 114);
    assert.equal(counts.satisfaction_and_minimum_cost_switch_required_groups, 225);
    for (const row of rows) {
      assert.equal(row.valid_groups + row.invalid_groups, row.groups);
      if (row.category === 'no_feasible_profile') {
        for (const key of ['H_pooled', 'E_pooled', 'C_given_satisfied', 'all_feasible_satisfied_group_rate']) assert.equal(row[key], null);
      } else {
        close(row.H_pooled, row.qualified_profiles / row.feasible_profiles, 'category H');
        close(row.E_pooled, row.efficiency_sum / row.feasible_profiles, 'category E');
      }
    }
    return {groups: 1390, feasible_groups: 940, categories: categories.map(c => ({category: c.category, groups: c.groups}))};
  });

  check('condition_means_and_pack_weighted_totals_recover_main_q', () => {
    const rows = analysis.conditions;
    assert.equal(rows.length, 720);
    assert.equal(new Set(rows.map(r => `${r.benchmark}/${r.model}/${r.axis}/${r.quantile_percent}`)).size, 720);
    for (const axis of ['budget', 'deadline']) for (const model of [...benchmark.models.map(m => m.id), 'observed_pool_oracle']) {
      for (const bid of ['ALL', ...benchmark.benchmarks.map(b => b.id)]) {
        const parts = rows.filter(r => r.axis === axis && r.model === model && r.benchmark === bid);
        assert.equal(parts.length, 4);
        const score = benchmark.scores.find(r => r.benchmark === bid && r.model === (model === 'observed_pool_oracle' ? benchmark.models[0].id : model));
        close(parts.reduce((s, r) => s + r.q, 0) / 4, score[model === 'observed_pool_oracle' ? 'oracle' : 'q'], `${bid}/${model}/${axis}`);
      }
      for (const quantile of [25, 50, 75, 95]) {
        const parts = rows.filter(r => r.axis === axis && r.model === model && r.quantile_percent === quantile && r.benchmark !== 'ALL');
        const total = rows.find(r => r.axis === axis && r.model === model && r.quantile_percent === quantile && r.benchmark === 'ALL');
        close(total.q, parts.reduce((s, r) => s + r.q * r.task_packs, 0) / total.task_packs, 'condition pack weighting');
        assert.equal(total.task_packs, 1180);
        assert.equal(total.scenarios, 5560);
        assert.equal(total.targets, 1390);
      }
    }
    return {condition_rows: 720, axes: 2, models_including_oracle: 9};
  });
} catch (error) {
  report.checks.push({name: 'load_inputs_and_scoring_module', status: 'fail', error: error.message});
}

report.status = report.checks.some(x => x.status === 'fail') ? 'fail' : 'pass';
report.summary = {passed: report.checks.filter(x => x.status === 'pass').length,
  failed: report.checks.filter(x => x.status === 'fail').length};
await mkdir(new URL('review/', root), {recursive: true});
const output = new URL('review/scoring_audit.json', root);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status.toUpperCase()}: ${report.summary.passed} checks passed; ${report.summary.failed} failed.`);
console.log(fileURLToPath(output));
for (const check of report.checks.filter(x => x.status === 'fail')) console.error(`${check.name}: ${check.error}`);
if (report.status !== 'pass') process.exitCode = 1;
