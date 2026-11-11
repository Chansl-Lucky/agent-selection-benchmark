import {renderGalleryStrips} from './gallery-strip.js';
import {evaluateScenario, referenceScores} from './scoring.js';

const $ = selector => document.querySelector(selector);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => value == null ? '—' : `$${Number(value).toFixed(6)}`;
const seconds = value => value == null ? '—' : `${Number(value).toFixed(3)} s`;
const percent = value => `${(value * 100).toFixed(2)}%`;
const state = {step:'66.2',budget:2,deadline:3,choice:'zero'};
let examples = [], scicode;

const menu = $('.menu-toggle');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  $('.site-header nav').classList.toggle('is-open', open);
});

function renderGallery() {
  const benchmark = $('#gallery-filter').value;
  const search = $('#gallery-search').value.toLowerCase().trim();
  const visible = examples.filter(item => (benchmark === 'all' || item.benchmark === benchmark) && [item.title,item.description,item.benchmark_name,item.task_id,item.source_task_id].join(' ').toLowerCase().includes(search));
  $('#gallery-count').textContent = `${visible.length} of ${examples.length} examples`;
  renderGalleryStrips($('#example-grid'), visible);
}

function renderCase(item) {
  const stepScope = item.resource_scope === 'saved_output_cumulative_prefix';
  document.title = `${item.benchmark_name}: ${item.title} · Agent Selection Benchmark`;
  const position = examples.indexOf(item);
  const neighbors = [examples[position - 1],examples[position + 1]];
  $('#case-content').innerHTML = `<header class="case-heading"><p class="case-origin">${html(item.benchmark_name)} · ${html(item.task_id)} · Fold ${item.fold}</p><h1>${html(item.title)}</h1><p>${html(item.description)}</p><p class="case-note">Task description: ${html(item.text_kind)}. This page presents the archived evaluator view; target outcomes are hidden from the selector during testing.</p></header>
  <section class="case-summary" aria-label="Recorded case summary"><dl><div><dt>Candidate configurations</dt><dd>${item.candidate_count}</dd></div><div><dt>${stepScope ? 'Native passes for step 66.2' : 'Native full-task passes'}</dt><dd>${item.native_pass_count} / ${item.candidate_count}</dd></div><div><dt>${stepScope ? 'Feasible across all six steps' : 'Feasible scenarios'}</dt><dd>${item.feasible_cases} / ${item.main_cases}</dd></div></dl></section>
  <section class="case-section"><h2>Acceptance target and recorded resources</h2><p>${stepScope ? 'For this scientific computing task, each saved subtask output has its own native acceptance result. Cost and elapsed time are cumulative through that output; a successful step does not establish full-task success.' : 'The acceptance target is the original benchmark’s full-task native verdict. A configuration qualifies for a scenario only when it passes that verdict and satisfies both the stated budget and deadline.'}</p><div class="case-table-scroll"><table class="case-table"><thead><tr><th scope="col">Recorded fact</th><th scope="col">Value</th></tr></thead><tbody><tr><td>Acceptance target</td><td>${html(item.contract_id)}</td></tr><tr><td>Cost range ${stepScope ? '(through step 66.2)' : '(whole task)'}</td><td>${money(item.cost_usd.min)} – ${money(item.cost_usd.max)}</td></tr><tr><td>Duration range ${stepScope ? '(through step 66.2)' : '(whole task)'}</td><td>${seconds(item.duration_seconds.min)} – ${seconds(item.duration_seconds.max)}</td></tr><tr><td>Recorded resources available</td><td>${item.cost_usd.known_count} costs; ${item.duration_seconds.known_count} durations</td></tr><tr><td>Observed-pool Oracle Q for this package</td><td>${percent(item.oracle_q)}</td></tr></tbody></table></div><p class="case-note">The ranges include failed candidates. The least expensive recorded execution is not necessarily a satisfactory choice.</p></section>
  ${item.id === 't1167' ? '<div id="scicode-walkthrough"></div>' : genericProcess(item)}
  <section class="case-section case-source"><h2>Source reference</h2><p><b>Source task:</b> <code>${html(item.source_task_key)}</code></p><p><b>Archived ground-truth file:</b> <code>${html(item.source.ground_truth)}</code></p><p><b>SHA-256:</b> <code>${html(item.source.sha256)}</code></p><p><a href="data/gallery.json" download>Download example facts (JSON)</a>${item.id === 't1167' ? ' · <a href="data/scicode66.json" download>Download the SciCode walkthrough data (JSON)</a>' : ''}</p></section>
  <nav class="case-neighbors" aria-label="Other examples">${neighbors[0] ? `<a href="case.html?id=${encodeURIComponent(neighbors[0].id)}">← ${html(neighbors[0].benchmark_name)}: ${html(neighbors[0].title)}</a>` : '<span></span>'}${neighbors[1] ? `<a href="case.html?id=${encodeURIComponent(neighbors[1].id)}">${html(neighbors[1].benchmark_name)}: ${html(neighbors[1].title)} →</a>` : ''}</nav>`;
}

function genericProcess(item) {
  return `<section class="case-section"><h2>From selection to score</h2><p>A selection instance contains the task context, available candidate configurations, other-task historical evidence, and an objective specifying the acceptance target, budget, and deadline. The selector submits one candidate ID for each objective.</p><p>For each selected candidate, the evaluator checks the archived native verdict and recorded resources. Scenario satisfaction is 1 if all requirements hold, and 0 otherwise. On a scenario with a satisfactory candidate, efficiency is the least satisfactory execution cost divided by the cost of the selected satisfactory execution; a non-satisfactory selection receives 0.</p><p>This package contains ${item.main_cases} constrained scenarios, of which ${item.feasible_cases} have a satisfactory candidate in the observed pool. Scenarios with no satisfactory candidate contribute 0 to satisfaction and are excluded from the efficiency denominator.</p><p class="case-note">This gallery entry contains the exported task summary and aggregate execution facts. The complete candidate table, original task materials, and individual historical cards are not part of this page. <a href="case.html?id=t1167">The SciCode example</a> shows the input, historical cards, and a complete numerical scoring calculation.</p></section>`;
}

function renderWalkthrough() {
  $('#scicode-walkthrough').innerHTML = `<section class="case-section"><h2>What the selector receives</h2><p>${html(scicode.description)}</p><p>The candidate model is <code>${html(scicode.model)}</code>. The two configurations use different execution harnesses:</p><div class="case-table-scroll"><table class="case-table"><thead><tr><th scope="col">Candidate ID</th><th scope="col">Configuration</th><th scope="col">Harness</th></tr></thead><tbody>${scicode.candidates.map(c => `<tr><td>${html(c.alias)}</td><td>${html(c.id)}</td><td>${html(c.harness)}</td></tr>`).join('')}</tbody></table></div><p>The current source task is held out in Fold ${scicode.held_out_fold}. Historical evidence comes from folds ${scicode.history_folds.join(', ')}, with ${scicode.history_task_count} other source tasks. Budget and deadline values are historical quantiles from these other folds.</p><h3>Historical summary and sample cards</h3><p>${scicode.history_summary.map(row => `${html(row.candidate)}: ${row.native_pass} / ${row.tasks} full-task passes`).join('; ')}.</p>${scicode.history_cards.map(card => `<article class="case-history-card"><h3>${html(card.name)} · ${html(card.source_task_key)}</h3><p>${html(card.description)} <span class="case-note">Fold ${card.fold}.</span></p><div class="case-table-scroll"><table class="case-table"><thead><tr><th scope="col">Configuration</th><th scope="col">Full-task verdict</th><th scope="col">Cost</th><th scope="col">Duration</th></tr></thead><tbody>${card.native_full.map(row => `<tr><td>${html(row.candidate)}</td><td>${html(row.native_status)}</td><td>${money(row.cost_usd)}</td><td>${seconds(row.duration_seconds)}</td></tr>`).join('')}</tbody></table></div></article>`).join('')}<p class="case-note">These are sample cards from other tasks, not historical executions of the held-out target. A full-task failure in a history card does not determine success on a particular step of the current task.</p></section>
  <section class="case-section" id="scoring"><h2>Choose a requirement and calculate the score</h2><p>Select a saved-output target, budget, deadline, and candidate below. The calculation uses the archived facts and the same scenario-level scoring rules as the benchmark.</p><div class="case-controls"><label>Acceptance target<select id="case-step">${scicode.steps.map(step => `<option value="${step.id}">${step.id} · ${html(step.name)}</option>`).join('')}</select></label><label>Candidate selection<select id="case-choice">${scicode.candidates.map(c => `<option value="${c.id}">${html(c.alias)} · ${html(c.id)} (${html(c.harness)})</option>`).join('')}</select></label><label>Budget<select id="case-budget">${scicode.budgets.map((v,i) => `<option value="${i}">P${v.quantile*100} · ${money(v.value)}</option>`).join('')}</select></label><label>Deadline<select id="case-deadline">${scicode.deadlines.map((v,i) => `<option value="${i}">P${v.quantile*100} · ${seconds(v.value)}</option>`).join('')}</select></label></div><h3>Private target facts used by the evaluator</h3><p class="case-note">These outcomes are shown for this walkthrough. They are not supplied to the selector for this target during evaluation.</p><div id="case-outcomes"></div><div id="case-score" class="case-score" aria-live="polite"></div></section>
  <section class="case-section"><h2>Submission and package-level aggregation</h2><p>The actual package requests ${scicode.submission_shape.total_choices} candidate IDs in scenario order: ${scicode.submission_shape.main_choices} constrained choices (six steps × four budgets × four deadlines) and ${scicode.submission_shape.baseline_choices} unconstrained baseline choices. Its submission format is:</p><code class="case-choice-code">${html(scicode.submission_shape.format)}</code><p>The constrained choices determine the reported main scores below. Q averages scenario satisfaction over all ${scicode.submission_shape.main_choices} constrained scenarios. E averages scenario efficiency over the ${scicode.reference_scores[0].feasible_cases} scenarios with at least one satisfactory candidate.</p><div class="case-table-scroll"><table class="case-table" id="case-reference"><thead><tr><th scope="col">Reference submission</th><th scope="col">Satisfactory scenarios</th><th scope="col">Q</th><th scope="col">E</th></tr></thead><tbody>${['zero','tools','oracle'].map(strategy => {const r=referenceScores(scicode,strategy);return `<tr><td>${strategy==='oracle'?'Observed-pool Oracle':`Always ${strategy}`}</td><td>${r.qualified_cases} / ${r.main_cases}</td><td>${percent(r.q)}</td><td>${percent(r.e)}</td></tr>`;}).join('')}</tbody></table></div><p class="case-note">These are deterministic reference submissions, not selector model results. The Oracle uses the private target facts to select a minimum-cost satisfactory candidate wherever one exists. The website calculates this table directly from the released walkthrough data.</p></section>`;
  for (const field of ['step','choice','budget','deadline']) {
    const select = $(`#case-${field}`);
    select.value = String(state[field]);
    select.addEventListener('change', () => {state[field] = ['budget','deadline'].includes(field) ? Number(select.value) : select.value;calculateScore();});
  }
  calculateScore();
}

function calculateScore() {
  const step = scicode.steps.find(s => s.id === state.step);
  const budget = scicode.budgets[state.budget].value, deadline = scicode.deadlines[state.deadline].value;
  const r = evaluateScenario(step,budget,deadline,state.choice);
  $('#case-outcomes').innerHTML = `<div class="case-table-scroll"><table class="case-table"><thead><tr><th scope="col">Configuration</th><th scope="col">Native verdict</th><th scope="col">Cumulative cost</th><th scope="col">Cumulative time</th><th scope="col">Qualifies?</th></tr></thead><tbody>${r.outcomes.map(c => `<tr><td>${html(c.id)}</td><td class="${c.native_pass?'case-pass':'case-fail'}">${c.native_pass?'Pass':'Fail'}</td><td>${money(c.cost_usd)}</td><td>${seconds(c.duration_seconds)}</td><td class="${c.qualified?'case-pass':'case-fail'}">${c.qualified?'Yes':html(c.reasons.join('; '))}</td></tr>`).join('')}</tbody></table></div>`;
  const selected = r.chosen;
  const calculation = !r.oracle ? 'No candidate satisfies this objective. Scenario satisfaction is 0, and this scenario is excluded from E.' : selected.qualified ? `q = 1. The least expensive satisfactory candidate costs ${money(r.minCost)}. e = ${money(r.minCost)} / ${money(selected.cost_usd)} = ${selected.e.toFixed(4)}.` : `q = 0 and e = 0. A satisfactory candidate exists, but ${html(state.choice)} does not qualify: ${html(selected.reasons.join('; '))}.`;
  $('#case-score').innerHTML = `<p><strong>Choice: ${html(state.choice)} · target ${html(state.step)}</strong></p><p>Required: native pass, cost ≤ ${money(budget)}, time ≤ ${seconds(deadline)}.</p><p>Satisfactory candidates: ${r.feasible.length ? r.feasible.map(html).join(', ') : 'none'}.</p><p class="case-calculation" id="case-calculation">${calculation}</p>`;
}

async function start() {
  try {
    const response = await fetch('data/gallery.json');
    if (!response.ok) throw new Error(`gallery: ${response.status}`);
    examples = (await response.json()).examples;
    if ($('#example-grid')) {
      const benchmarks = [...new Map(examples.map(item => [item.benchmark,item.benchmark_name])).entries()];
      $('#gallery-filter').innerHTML += benchmarks.map(([id,name]) => `<option value="${html(id)}">${html(name)}</option>`).join('');
      $('.gallery-filters').addEventListener('submit', event => event.preventDefault());
      $('#gallery-filter').addEventListener('change', renderGallery);
      $('#gallery-search').addEventListener('input', renderGallery);
      renderGallery();
    } else {
      const id = new URLSearchParams(location.search).get('id');
      const item = examples.find(item => item.id === id);
      if (!item) {$('#case-content').innerHTML = '<h1>Example not found</h1><p>Please select an example from the <a href="gallery.html">gallery</a>.</p>';document.body.dataset.ready='true';return;}
      renderCase(item);
      if (item.id === 't1167') {
        const detail = await fetch('data/scicode66.json');
        if (!detail.ok) throw new Error(`scicode: ${detail.status}`);
        scicode = await detail.json();
        renderWalkthrough();
      }
    }
    document.body.dataset.ready='true';
  } catch (error) {
    $('#gallery-error').hidden=false;
    console.error('Gallery loading failed:',error);
  }
}
start();
