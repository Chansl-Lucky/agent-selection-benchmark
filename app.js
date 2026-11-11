const legacyPages = {'#cases':'gallery.html','#question':'research.html','#explorer':'case.html?id=t1167'};
if (legacyPages[location.hash]) location.replace(legacyPages[location.hash]);

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => Number(n).toLocaleString('en-US');
const pct = x => (x * 100).toFixed(2);
const usd = x => x == null ? '—' : '$' + Number(x).toFixed(6);
let benchmark, analysis;
const state = {metric:'q', benchmark:'ALL'};

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
tabKeyboard($('.module-tabs'));renderModule(0);

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

function initializeResults() {
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
    const response=await Promise.all(['benchmark','analysis'].map(async name=>{const r=await fetch(`data/${name}.json`);if(!r.ok)throw new Error(`${name}: ${r.status}`);return r.json();}));
    [benchmark,analysis]=response;
    initializeResults();renderAnalysis();
    document.body.dataset.ready='true';
  } catch (error) {
    console.error('Benchmark data loading failed:',error);$('#data-error').hidden=false;

  }
}
loadData();
