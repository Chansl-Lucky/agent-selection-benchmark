// Shared horizontal gallery. Every visual is computed from the published case facts.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = [
  {id:'science',name:'Science & computing',color:'#537ba5'},
  {id:'coding',name:'Code & algorithms',color:'#8870a5'},
  {id:'interaction',name:'Tools & interaction',color:'#b47c42'},
  {id:'information',name:'Information & reasoning',color:'#478779'}
];
const cleanups = new WeakMap();
let instance = 0;
function money(value) {
  if (value == null) return '—';
  const n = Number(value);
  return '$' + (n < .01 ? n.toFixed(4) : n.toFixed(2));
}
function time(value) {
  if (value == null) return '—';
  const n=Number(value);
  return n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US');
}
function acceptanceDots(item,color) {
  const total = item.candidate_count, pass = item.native_pass_count;
  const columns = Math.min(10,total), radius = total <= 4 ? 7 : 3;
  const gap = total <= 4 ? 20 : 9;
  const startX = total <= 4 ? 13 : 5;
  const dots = Array.from({length:total},(_,i)=>`<circle cx="${startX+(i%columns)*gap}" cy="${10+Math.floor(i/columns)*9}" r="${radius}" fill="${i<pass?color:'#e4e7e9'}"/>`).join('');
  return `<svg class="strip-native-dots" viewBox="0 0 94 49" aria-hidden="true">${dots}</svg>`;
}
function card(item,color) {
  const partial = item.resource_scope === 'saved_output_cumulative_prefix';
  const nativeLabel = partial ? '66.2 native checks' : 'Native checks';
  const fraction = item.feasible_cases/item.main_cases;
  const arc = (Math.max(0,Math.min(1,fraction))*100).toFixed(3);
  const coverage = `<svg viewBox="0 0 78 62" aria-hidden="true"><circle cx="37" cy="30" r="23" fill="none" stroke="#e8ebed" stroke-width="5"/><circle cx="37" cy="30" r="23" fill="none" stroke="${color}" stroke-width="5" pathLength="100" stroke-dasharray="${arc} 100" transform="rotate(-90 37 30)"/><text x="37" y="35" text-anchor="middle" fill="#4a4a4a" font-family="Noto Sans,Arial,sans-serif" font-size="13">${Math.round(fraction*100)}%</text></svg>`;
  const scope = partial ? 'Resources: through 66.2 · feasibility: six steps' : 'Recorded executions · full-task acceptance';
  const label = `${item.benchmark_name}: ${item.title}. ${item.native_pass_count} of ${item.candidate_count} native passes${partial?' for step 66.2':''}; ${item.feasible_cases} of ${item.main_cases} scenarios feasible. Open case details.`;
  return `<a class="strip-card" href="case.html?id=${encodeURIComponent(item.id)}" aria-label="${escapeHTML(label)}" style="--strip-color:${color}"><header class="strip-card-heading"><span class="strip-benchmark">${escapeHTML(item.benchmark_name)} <span>· ${escapeHTML(item.task_id)}</span></span><h3>${escapeHTML(item.title)}</h3><span class="strip-open" aria-hidden="true">↗</span></header><div class="strip-preview"><div class="strip-native"><span class="strip-caption">${nativeLabel}</span>${acceptanceDots(item,color)}<span class="strip-fraction">${item.native_pass_count} / ${item.candidate_count} pass</span></div><div class="strip-resources"><span class="strip-caption">${partial?'66.2 resources':'Recorded resources'}</span><div><small>Cost</small><span>${money(item.cost_usd.min)} – ${money(item.cost_usd.max)}</span></div><div><small>Time</small><span>${time(item.duration_seconds.min)} – ${time(item.duration_seconds.max)} s</span></div></div><div class="strip-feasibility"><span class="strip-caption">${partial?'All-step coverage':'Feasible scenarios'}</span>${coverage}<span class="strip-fraction">${item.feasible_cases} / ${item.main_cases} scenarios</span></div></div><span class="strip-scope">${scope}</span></a>`;
}

/** Mount linked case strips; returns cleanup for callers replacing the container. */
export function renderGalleryStrips(container, examples) {
  if (!container) return () => {};
  cleanups.get(container)?.();
  container.classList.add('gallery-strips');
  const groups = categories.map(group=>({...group,items:examples.filter(item=>item.category===group.id)})).filter(group=>group.items.length);
  const id=++instance;
  container.innerHTML = groups.map(group=>{
    const trackId=`case-strip-${id}-${group.id}`;
    return `<section class="strip-row" style="--strip-color:${group.color}" aria-labelledby="${trackId}-heading"><div class="strip-row-heading"><h2 id="${trackId}-heading">${group.name} <span>${group.items.length} examples</span></h2><div class="strip-controls" aria-label="${group.name} gallery navigation"><button type="button" data-strip-direction="-1" aria-controls="${trackId}" aria-label="Previous ${group.name.toLowerCase()} examples">←</button><button type="button" data-strip-direction="1" aria-controls="${trackId}" aria-label="Next ${group.name.toLowerCase()} examples">→</button></div></div><div class="strip-track" id="${trackId}" tabindex="0" role="region" aria-label="${group.name} examples; scroll horizontally">${group.items.map(item=>card(item,group.color)).join('')}</div></section>`;
  }).join('') || '<p class="strip-empty" role="status">No examples match these filters.</p>';
  const controller = new AbortController();
  const observers=[];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  container.querySelectorAll('.strip-row').forEach(row=>{
    const track=row.querySelector('.strip-track'), buttons=[...row.querySelectorAll('[data-strip-direction]')];
    const update=()=>{
      const maximum=Math.max(0,track.scrollWidth-track.clientWidth);
      buttons[0].disabled=track.scrollLeft<=2;
      buttons[1].disabled=track.scrollLeft>=maximum-2;
      row.classList.toggle('strip-overflows',maximum>2);
    };
    buttons.forEach(button=>button.addEventListener('click',()=>{
      track.scrollBy({left:Number(button.dataset.stripDirection)*Math.max(300,track.clientWidth*.75),behavior:reduced.matches?'instant':'smooth'});
    },{signal:controller.signal}));
    track.addEventListener('scroll',update,{passive:true,signal:controller.signal});
    track.addEventListener('keydown',event=>{
      if(event.target!==track) return;
      let left;
      if(event.key==='ArrowRight')left=track.scrollLeft+Math.max(300,track.clientWidth*.75);
      else if(event.key==='ArrowLeft')left=track.scrollLeft-Math.max(300,track.clientWidth*.75);
      else if(event.key==='Home')left=0;
      else if(event.key==='End')left=track.scrollWidth;
      else return;
      event.preventDefault();track.scrollTo({left,behavior:reduced.matches?'instant':'smooth'});
    },{signal:controller.signal});
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(update);observer.observe(track);observers.push(observer);
    }
    update();
  });
  const cleanup=()=>{controller.abort();observers.forEach(observer=>observer.disconnect());};
  cleanups.set(container,cleanup);
  return cleanup;
}
