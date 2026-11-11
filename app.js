import {evaluateScenario} from './scoring.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => Number(n).toLocaleString('en-US');
const pct = x => (x * 100).toFixed(2);
const usd = x => x == null ? '—' : '$' + Number(x).toFixed(6);
let benchmark, gallery, scicode, analysis;
const state = {metric:'q', benchmark:'ALL', step:'66.2', budget:2, deadline:3, choice:'zero', reveal:true};

const modules = [
  {title:'A / Objective formulation',text:'A task context x, an acceptance target g, and cost–time limits (B, D) define a selection instance. Candidate configurations combine a model, an execution harness, and their recorded settings.',flow:['Task context + candidates','Objective r = (g, B, D)','Selection problem']},
  {title:'B / Native execution evidence',text:'Executions in the original task environments provide trajectories, native verdicts, costs, and durations. Evidence is aligned by task, target, and candidate while preserving the scope of each acceptance check.',flow:['Native task environments','Recorded executions','Target-aligned facts']},
  {title:'C / Objective-conditioned construction',text:'Source-task splits separate permitted history from private target facts. Historical quantiles calibrate a 4 × 4 budget–time grid. Each specification induces the satisfactory set F and its minimum-cost subset O.',flow:['Other-task history','Public selection packages','Private reference sets F, O']},
  {title:'D / Selection and evaluation',text:'The selector submits one candidate ID per scenario. Q evaluates objective satisfaction; E combines feasible-scenario success with cost efficiency. Reference-set relations test necessary switching and consistency under relaxed constraints.',flow:['Candidate selection','Q · E = H × C','Adaptation + consistency']}
];
function renderModule(index) {
  const m = modules[index];
  $('#module-panel').innerHTML = `<div><h3>${m.title}</h3><p>${m.text}</p></div><div class="module-flow">${m.flow.map((t,i) => `${i?'<b aria-hidden="true">→</b>':''}<span>${t}</span>`).join('')}</div>`;
  $('#module-panel').setAttribute('aria-labelledby', `module-tab-${'abcde'[index]}`);
  $$('.module-tabs button').forEach((b,i) => {b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
}
function tabKeyboard(container) {
  container.addEventListener('keydown', event => {
    const tabs = $$('[role=tab]',container), at = tabs.indexOf(document.activeElement);
    if (at<0) return;
    let next;
    if (event.key==='ArrowRight') next=(at+1)%tabs.length;
    else if (event.key==='ArrowLeft') next=(at+tabs.length-1)%tabs.length;
    else if (event.key==='Home') next=0;
    else if (event.key==='End') next=tabs.length-1;
    else return;
    event.preventDefault(); tabs[next].focus();tabs[next].click();
  });
}
$$('.module-tabs button').forEach(b=>b.addEventListener('click',()=>renderModule(+b.dataset.module)));
tabKeyboard($('.module-tabs'));tabKeyboard($('.case-tabs'));renderModule(0);

$('.menu-toggle').addEventListener('click', () => {
  const open=$('.menu-toggle').getAttribute('aria-expanded')!=='true';
  $('.menu-toggle').setAttribute('aria-expanded',String(open));$('.site-header nav').classList.toggle('is-open',open);
  $('.menu-toggle').setAttribute('aria-label',open?'Close navigation':'Open navigation');
});
$$('.site-header nav a').forEach(a=>a.addEventListener('click',()=>{$('.site-header nav').classList.remove('is-open');$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','Open navigation');}));

function openDialog(dialog) {dialog.showModal();document.body.classList.add('dialog-open');}
$$('dialog').forEach(dialog=>{
  $('.dialog-close',dialog).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
});
$('.image-zoom').addEventListener('click',()=>openDialog($('#image-dialog')));

const categories=[
  {id:'science',label:'Science & computing',en:'SCIENCE',fill:'#eaf0e4',ink:'#5e8060'},
  {id:'coding',label:'Code & algorithms',en:'CODE',fill:'#e9eef5',ink:'#5d7ca2'},
  {id:'interaction',label:'Tools & interaction',en:'INTERACTION',fill:'#f2eade',ink:'#a37c4a'},
  {id:'information',label:'Information & reasoning',en:'REASONING',fill:'#eee9f3',ink:'#8b72a4'}
];
function caseArt(example,theme,index) {
  const motifs={
    science:`<path d="M34 69H112M42 25V69"/><path d="M44 63C53 66 55 31 65 37S77 73 87 46S102 28 110 33" stroke-width="2"/><circle cx="66" cy="37" r="3" fill="currentColor"/><circle cx="88" cy="45" r="3" fill="currentColor"/>`,
    coding:`<rect x="34" y="24" width="83" height="50" rx="5"/><path d="M34 36H117M55 44L47 50L55 56M91 44L99 50L91 56M77 41L69 61"/><path d="M46 30H49M54 30H57M62 30H65M47 67H76" stroke-width="2"/>`,
    interaction:example.benchmark==='taubench_airline'?`<path d="M36 66C53 66 58 32 105 35" stroke-dasharray="3 3"/><circle cx="37" cy="66" r="4"/><circle cx="107" cy="35" r="4"/><path d="M61 47L85 36L79 59L72 51L61 47ZM72 51L85 36"/>`:`<rect x="34" y="25" width="83" height="48" rx="5"/><path d="M34 36H117M44 46H70M44 54H64M44 62H78"/><path d="M90 44L104 55L96 57L94 65Z" fill="currentColor" opacity=".6"/>`,
    information:`<rect x="35" y="28" width="49" height="43" rx="4"/><path d="M44 39H73M44 47H67M44 55H62"/><circle cx="94" cy="47" r="14"/><path d="M104 58L115 69" stroke-width="3"/>`
  };
  const dots=Array.from({length:Math.min(example.candidate_count,48)},(_,i)=>`<rect x="${151+(i%8)*9}" y="${30+Math.floor(i/8)*7}" width="5" height="4" rx="1" fill="${i<example.native_pass_count?theme.ink:'#c9d1c8'}"/>`).join('');
  return `<svg viewBox="0 0 260 94" aria-hidden="true"><g fill="none" stroke="${theme.ink}" color="${theme.ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${motifs[example.category]}</g><path d="M129 26V73" stroke="${theme.ink}" opacity=".16"/>${dots}<text x="151" y="82" fill="${theme.ink}" font-size="7" font-family="sans-serif">NATIVE ACCEPTANCE</text></svg>`;
}
function renderGallery() {
  $('#gallery').innerHTML=categories.map((category,index)=>{
    const cases=gallery.examples.filter(x=>x.category===category.id);
    return `<div class="gallery-row"><div class="gallery-label"><small>0${index+1} / ${category.en}</small><strong>${category.label}</strong><div class="gallery-arrows"><button data-scroll="-1" data-track="gallery-${category.id}" aria-label="Scroll ${category.label} left">←</button><button data-scroll="1" data-track="gallery-${category.id}" aria-label="Scroll ${category.label} right">→</button></div></div><div class="gallery-track" id="gallery-${category.id}" aria-label="${category.label} cases">${cases.map((c,i)=>`<button class="case-card" data-case="${escapeHTML(c.id)}" aria-label="View ${escapeHTML(c.benchmark_name)}: ${escapeHTML(c.title)}"><div class="card-art" style="--card-bg:${category.fill};--card-ink:${category.ink}"><span class="art-id">${escapeHTML(c.task_id.toUpperCase())}</span>${caseArt(c,category,i)}</div><div class="card-content"><div class="card-bench">${escapeHTML(c.benchmark_name)} <span aria-hidden="true">↗</span></div><h3>${escapeHTML(c.title)}</h3><div class="card-data"><span><b>${c.candidate_count}</b> services</span><span>${c.resource_scope==='saved_output_cumulative_prefix'?'66.2 passes':'Native passes'} <b>${c.native_pass_count}</b></span><span>${c.resource_scope==='saved_output_cumulative_prefix'?'Feasible across six steps':'Feasible'} <b>${c.feasible_cases}/${c.main_cases}</b></span></div></div></button>`).join('')}</div></div>`;
  }).join('');
  $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{
    const t=document.getElementById(b.dataset.track);t.scrollBy({left:Number(b.dataset.scroll)*Math.min(t.clientWidth*.8,550),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
  $$('[data-case]').forEach(b=>b.addEventListener('click',()=>showCase(b.dataset.case)));
}
function showCase(id) {
  const c=gallery.examples.find(x=>x.id===id);
  const prefix=c.resource_scope==='saved_output_cumulative_prefix';
  const special=c.contract_id==='native.full'?'Full-task native ':`Step ${c.contract_id.replace('native.step:','')} native `;
  $('#dialog-content').innerHTML=`<div class="dialog-bench">${escapeHTML(c.benchmark_name)} · ${escapeHTML(c.task_id)}</div><h2 id="dialog-title">${escapeHTML(c.title)}</h2><p class="dialog-description">${escapeHTML(c.description)}</p><span class="dialog-tag">Archived case · evaluator view</span><div class="dialog-stats"><div><strong>${c.candidate_count}</strong><small>Recorded candidate services</small></div><div><strong>${c.native_pass_count}</strong><small>${special}passes</small></div><div><strong>${c.feasible_cases}/${c.main_cases}</strong><small>${prefix?'Feasible scenarios across six steps':'Scenarios with a feasible candidate'}</small></div></div><div class="dialog-details"><p><b>Recorded cost: </b>${usd(c.cost_usd.min)} – ${usd(c.cost_usd.max)} USD</p><p><b>Recorded duration: </b>${c.duration_seconds.min?.toFixed(2)??'—'} – ${c.duration_seconds.max?.toFixed(2)??'—'} s</p><p>Ranges cover candidates with recorded resources, including failed runs. The lowest recorded cost is not necessarily the lowest feasible cost. ${prefix?'Pass counts and resource ranges here refer to step 66.2; resources accumulate through that saved output. The 22/96 feasible scenarios cover all six steps, each with 16 requirements.':''}</p><p>Artwork illustrates the task type. Target outcomes are shown here to explain the evaluation; they are hidden from routers during testing.</p></div><p class="dialog-source"><b>Source task: </b>${escapeHTML(c.source_task_key)}<br><b>Source: </b>${escapeHTML(c.source.ground_truth)}<br><b>SHA256: </b>${escapeHTML(c.source.sha256)}</p>${c.task_id==='t1167'?'<p style="margin-top:18px"><button class="text-button" id="go-scicode">Explore the SciCode scoring example →</button></p>':''}`;
  openDialog($('#case-dialog'));
  $('#go-scicode')?.addEventListener('click',()=>{$('#case-dialog').close();$('#explorer').scrollIntoView({behavior:'smooth'});});
}

function initializeExplorer() {
  $('#budget').innerHTML=scicode.budgets.map((v,i)=>`<option value="${i}">P${v.quantile*100} · ${usd(v.value)}</option>`).join('');
  $('#deadline').innerHTML=scicode.deadlines.map((v,i)=>`<option value="${i}">P${v.quantile*100} · ${v.value.toFixed(2)} s</option>`).join('');
  const history=document.createElement('details');history.className='history-evidence';
  history.innerHTML=`<summary>Inspect the permitted history <span>52 other source tasks + 2 related cases</span></summary><div><p>This task belongs to Fold 3. The records below come from the other folds.</p><div class="history-summary">${scicode.history_summary.map(h=>`<span><b>${escapeHTML(h.candidate)}</b> Full-task passes ${h.native_pass}/${h.tasks}</span>`).join('')}</div>${scicode.history_cards.map(h=>`<article><b>${escapeHTML(h.source_task_key)} · Fold ${h.fold}</b><p>${escapeHTML(h.description)}</p><div>${h.native_full.map(c=>`<span>${escapeHTML(c.candidate)}: full-task ${c.native_status==='pass'?'pass':'fail'} · ${usd(c.cost_usd)} · ${c.duration_seconds.toFixed(1)}s</span>`).join('')}</div></article>`).join('')}<small>Failure on another full task does not determine the outcome of this task or step. The router must interpret the evidence in relation to the current task and acceptance goal.</small></div>`;
  $('.request-panel').append(history);
  $$('.case-tabs button').forEach(b=>b.addEventListener('click',()=>{
    state.step=b.dataset.step;state.budget=state.step==='66.2'?2:3;state.deadline=3;renderExplorer();
  }));
  $('#budget').addEventListener('change',e=>{state.budget=+e.target.value;renderExplorer();});
  $('#deadline').addEventListener('change',e=>{state.deadline=+e.target.value;renderExplorer();});
  $$('input[name=choice]').forEach(b=>b.addEventListener('change',()=>{state.choice=b.value;renderExplorer();}));
  $('#toggle-truth').addEventListener('click',()=>{state.reveal=!state.reveal;renderExplorer();});
  $('#reveal-truth').addEventListener('click',()=>{state.reveal=true;renderExplorer();});
  renderExplorer();
}
function renderExplorer() {
  const step=scicode.steps.find(s=>s.id===state.step), budget=scicode.budgets[state.budget], deadline=scicode.deadlines[state.deadline];
  const r=evaluateScenario(step,budget.value,deadline.value,state.choice);
  $('#budget').value=state.budget;$('#deadline').value=state.deadline;
  $('#budget-value').textContent=usd(budget.value);$('#deadline-value').textContent=`${deadline.value.toFixed(2)} s`;
  $('#step-title').textContent=step.name;
  const descriptions={'66.2':'Compute local atomic normals for the interlayer potential. The saved output must pass the native checks for this step.','66.3':'Compute the repulsive component of the interlayer interaction. Select a configuration that passes the native checks for this step.','66.5':'Compute the cutoff function for the potential within the specified cost and completion-time limits.'};
  $('#step-description').textContent=descriptions[state.step];
  $$('.case-tabs button').forEach(b=>{const on=b.dataset.step===state.step;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on)$('#case-panel').setAttribute('aria-labelledby',b.id);});
  $('#candidate-outcomes').innerHTML=['zero','tools'].map(id=>{
    const c=r.outcomes.find(x=>x.id===id);
    return `<article class="outcome"><div class="outcome-top"><b>${id}</b><span class="outcome-status ${c.qualified?'':'fail'}">${c.qualified?'Qualified':'Not qualified'}</span></div><div class="outcome-facts"><span>Native checks<b>${c.native_pass?'pass':'fail'}</b></span><span>Cumulative cost<b>${usd(c.cost_usd)}</b></span><span>Cumulative time<b>${c.duration_seconds.toFixed(2)}s</b></span></div>${c.reasons.length?`<p class="outcome-reason">${c.reasons.join(' · ')}</p>`:''}</article>`;
  }).join('');
  $('#selection-score').classList.toggle('is-fail',!r.chosen.qualified);
  $('#selection-score').innerHTML=`<div class="score-explainer"><b>Your choice: ${state.choice}</b>${!r.oracle?'No candidate is feasible; this scenario is excluded from E.':r.chosen.qualified?'The selected service satisfies every requirement.':'A feasible candidate exists, but the selected service does not qualify.'}</div><div class="score-value">${r.chosen.q}<small>Scenario satisfaction q</small></div><div class="score-value">${r.chosen.e===null?'—':r.chosen.e.toFixed(4)}<small>Scenario efficiency e</small></div>`;
  let cells='<span class="grid-axis">B ↓ / D →</span>'+scicode.deadlines.map(x=>`<span class="grid-axis">P${x.quantile*100}</span>`).join('');
  scicode.budgets.forEach((b,bi)=>{
    cells+=`<span class="grid-axis">P${b.quantile*100}</span>`;
    scicode.deadlines.forEach((d,di)=>{
      const test=evaluateScenario(step,b.value,d.value,'zero');const type=test.feasible.length===2?'both':test.feasible[0]??'none';
      const label=type==='both'?'Both qualify':type==='none'?'Neither qualifies':`Only ${type} qualifies`;
      cells+=`<button class="grid-cell ${type}" data-b="${bi}" data-d="${di}" aria-pressed="${bi===state.budget&&di===state.deadline}" aria-label="Budget P${b.quantile*100}, deadline P${d.quantile*100}: ${label}">${type==='both'?'2':type==='none'?'–':type==='zero'?'Z':'T'}</button>`;
    });
  });
  $('#feasibility-grid').innerHTML=cells;
  $$('.grid-cell').forEach(b=>b.addEventListener('click',()=>{state.budget=+b.dataset.b;state.deadline=+b.dataset.d;renderExplorer();}));
  $('#truth-content').hidden=!state.reveal;$('#truth-hidden').hidden=state.reveal;
  $('#toggle-truth').textContent=state.reveal?'Hide private outcomes':'Show private outcomes';$('#toggle-truth').setAttribute('aria-expanded',String(state.reveal));
}

function initializeResults() {
  $('#stat-bench').textContent=number(benchmark.meta.benchmark_count);$('#stat-packs').textContent=number(benchmark.meta.task_packs);
  $('#stat-cases').textContent=number(benchmark.meta.main_cases);$('#stat-models').textContent=number(benchmark.meta.formal_models);
  $('#snapshot-label').textContent=`Results snapshot: ${benchmark.meta.results_date}`;
  $('#benchmark-filter').innerHTML='<option value="ALL">All tasks</option>'+benchmark.benchmarks.map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)}</option>`).join('');
  $('#benchmark-filter').addEventListener('change',e=>{state.benchmark=e.target.value;renderResults();});
  $$('[data-metric]').forEach(b=>b.addEventListener('click',()=>{state.metric=b.dataset.metric;renderResults();}));
  renderResults();
}
function renderResults() {
  const metric=state.metric, metricLabel=metric==='q'?'Objective satisfaction Q':'Cost efficiency E';
  const subset=benchmark.scores.filter(s=>s.benchmark===state.benchmark).sort((a,b)=>b[metric]-a[metric]);
  const name=state.benchmark==='ALL'?'All tasks':benchmark.benchmarks.find(b=>b.id===state.benchmark).name;
  const model=id=>benchmark.models.find(m=>m.id===id);
  const best=subset[0],oracle=best.oracle;
  $$('[data-metric]').forEach(b=>{const on=b.dataset.metric===metric;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('#chart-title').textContent=`${metricLabel} · ${name}`;
  $('#bar-chart').innerHTML=subset.map(s=>`<div class="bar-row"><span class="bar-label">${escapeHTML(model(s.model).name)}</span><div class="bar-track" role="img" aria-label="${escapeHTML(model(s.model).name)} ${metricLabel} ${pct(s[metric])}"><div class="bar-fill" style="--bar:${pct(s[metric])}%;--bar-color:${model(s.model).color}"></div></div><span class="bar-value">${pct(s[metric])}</span></div>`).join('')+(metric==='q'?`<div class="bar-row oracle"><span class="bar-label">Observed-pool Oracle</span><div class="bar-track" role="img" aria-label="Oracle Q ${pct(oracle)}"><div class="bar-fill" style="--bar:${pct(oracle)}%"></div></div><span class="bar-value">${pct(oracle)}</span></div>`:'');
  $('#chart-footnote').textContent=metric==='q'?'Q and Oracle Q are averaged across task packs. Their gap measures feasible choices that the router did not recover from the observed candidate pool.':'E is averaged over feasible scenarios; a non-qualifying choice scores zero. It compares candidate execution costs, separately from the API cost of the router.';
  $('#result-insight-title').textContent=metric==='q'?'How much feasible capability is selected?':'How efficiently are feasible services selected?';
  $('#result-insight').textContent=metric==='q'?`For ${name}, ${model(best.model).name} scores ${pct(best.q)} on Q against an Oracle of ${pct(oracle)}: a gap of ${((oracle-best.q)*100).toFixed(2)} percentage points. The gap alone does not identify a particular reasoning or evidence-use mechanism.`:`For ${name}, ${model(best.model).name} scores ${pct(best.e)} on E. This combines successful selection with relative execution cost; it does not mean a ${pct(best.e)}% cost saving.`;
  $('#result-oracle').textContent=metric==='q'?pct(oracle):'100.00';
  $('#result-oracle').previousElementSibling.textContent=metric==='q'?'Observed-pool ceiling Q':'Feasible-scenario ceiling E';
  $('#result-pack-count').textContent=number(best.task_packs);
  $('#table-metric-label').textContent=`${metricLabel} · 0–100 scale`;
  const table=$('#results-table');
  $('thead',table).innerHTML=`<tr><th scope="col">Benchmark</th>${benchmark.models.map(m=>`<th scope="col">${escapeHTML(m.name)}</th>`).join('')}${metric==='q'?'<th scope="col">Oracle Q</th>':''}</tr>`;
  $('tbody',table).innerHTML=[...benchmark.benchmarks,{id:'ALL',name:'Overall · official aggregation',task_packs:benchmark.meta.task_packs}].map(b=>{
    const rows=benchmark.models.map(m=>benchmark.scores.find(s=>s.model===m.id&&s.benchmark===b.id));const max=Math.max(...rows.map(s=>s[metric]));
    return `<tr><td>${escapeHTML(b.name)}<span class="table-pack">${number(b.task_packs)} task packs</span></td>${rows.map(s=>`<td class="${s[metric]===max?'best':''}">${pct(s[metric])}</td>`).join('')}${metric==='q'?`<td>${pct(rows[0].oracle)}</td>`:''}</tr>`;
  }).join('');
}

function renderAnalysis() {
  const container = $('#adaptation-table-container');
  if (!container) return;
  const names = Object.fromEntries(benchmark.models.map(m=>[m.id,m.name]));
  container.innerHTML = `<div class="table-topline"><h3>Adaptation and consistency by selector</h3><a class="text-button" href="data/model_diagnostics.csv" download>Download diagnostics CSV ↗</a></div><div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable adaptation and consistency results"><table id="adaptation-table"><caption class="sr-only">Eight selectors: condition-specific satisfaction gain, full coverage of switching-required target groups, and avoidable regression rate</caption><thead><tr><th scope="col">Selector</th><th scope="col">Q ↑</th><th scope="col">E ↑</th><th scope="col">ΔQ (pp) ↑</th><th scope="col">Full coverage ↑</th><th scope="col">Regressions ↓</th><th scope="col">Regression rate ↓</th></tr></thead><tbody>${analysis.model_diagnostics.map(r=>`<tr><td>${escapeHTML(names[r.model])}</td><td>${pct(r.q)}</td><td>${pct(r.e)}</td><td>+${r.adaptation_gain_pp.toFixed(2)}</td><td>${r.all_feasible_success} / ${r.required_groups}</td><td>${number(r.regressions)} / ${number(r.regression_opportunities)}</td><td>${pct(r.regression_rate)}%</td></tr>`).join('')}</tbody></table></div><div class="results-notes"><p><b>Adaptation gain.</b> ΔQ compares scenario-specific decisions with replaying the same selector’s unconstrained choice. Full coverage counts target groups where all feasible conditions are satisfied, among the 114 groups requiring a change of candidate.</p><p><b>Regression rate.</b> Among relaxation comparisons with a satisfactory tighter-condition choice, count failures at the relaxed condition. That earlier choice is a verified feasible alternative. Lower regression alone does not imply better overall selection.</p></div>`;
}

async function loadData() {
  try {
    const response=await Promise.all(['benchmark','gallery','scicode66','analysis'].map(async name=>{const r=await fetch(`data/${name}.json`);if(!r.ok)throw new Error(`${name}: ${r.status}`);return r.json();}));
    [benchmark,gallery,scicode,analysis]=response;
    renderGallery();initializeExplorer();initializeResults();renderAnalysis();
    document.body.dataset.ready='true';
  } catch (error) {
    console.error('Benchmark data loading failed:',error);$('#data-error').hidden=false;
    $('#gallery').innerHTML='<p class="loading">Serve this page over HTTP to load the benchmark data.</p>';
  }
}
loadData();
