#!/usr/bin/env python3
"""Export a small, allowlisted website snapshot from the current formal results.

Only aggregate results and curated demonstration fields are exported. No API calls,
credentials, full trace archives, reference answers or original task attachments.
GAIA and Online-Mind2Web deliberately contain no original task text or target URLs.
"""
from __future__ import annotations
import argparse
import csv
from datetime import date
from decimal import Decimal
from fractions import Fraction
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / 'experiments/compact_benchmark_20261102'
DATA = ROOT / 'project_site/data'
SOURCES = {}

BENCHMARKS = [
    ('assistantbench', 'AssistantBench', 'information', 'Open-world information retrieval'),
    ('corebench_hard', 'CORE-Bench', 'science', 'Computational reproducibility'),
    ('gaia', 'GAIA', 'information', 'Multi-tool information reasoning'),
    ('online_mind2web', 'Online-Mind2Web', 'interaction', 'Web interaction'),
    ('scicode', 'SciCode', 'science', 'Scientific programming'),
    ('scienceagentbench', 'ScienceAgentBench', 'science', 'Data science workflows'),
    ('swebench_verified_mini', 'SWE-bench Verified Mini', 'coding', 'Repository issue resolution'),
    ('taubench_airline', 'τ-bench Airline', 'interaction', 'Airline service workflows'),
    ('usaco', 'USACO', 'coding', 'Algorithmic programming'),
]
MODEL_NAMES = {'gpt-6.1-sol':'GPT-6.1-sol', 'claude-sonnet-5-5':'Claude Sonnet 5.5',
               'gemini-3.8-flash':'Gemini 3.8 Flash', 'qwen3-vl-plus':'Qwen3-VL-Plus', 'glm-5.3':'GLM-5.3',
               'deepseek-v4.1-flash':'DeepSeek-v4.1-Flash','kimi-k3.1-pro':'Kimi-K3.1-Pro',
               'doubao-seed-2.1-pro':'Doubao-Seed-2.1-Pro'}
COLORS = ['#007F78','#D97B18','#35A46A','#355FAD','#C44464','#7051A6','#9A6734','#1696BB']
EXAMPLES = {
 't0005': ('Compare historical card prices','Compare peak-to-low price declines for cards banned in the same announcement.'),
 't0011': ('Annual passes or day tickets?','Compare museum admission costs using family members\' ages and the number of visits per year.'),
 't0034': ('Reproduce an R manuscript','Run and render an R Markdown manuscript, then report the requested results from its reproduced figures.'),
 't0035': ('Reproduce a classification experiment','Run the supplied classification experiment and report its AUC after training.'),
 't0079': ('Multi-tool reasoning case A','A recorded GAIA routing case. This example includes task identifiers and aggregate execution statistics only.'),
 't0083': ('Multi-tool reasoning case B','A recorded GAIA routing case. This example includes task identifiers and aggregate execution statistics only.'),
 't0244': ('Web interaction case A','A recorded Online-Mind2Web routing case. This example includes task identifiers and aggregate execution statistics only.'),
 't0245': ('Web interaction case B','A recorded Online-Mind2Web routing case. This example includes task identifiers and aggregate execution statistics only.'),
 't0547': ('Brownian motion in an optical trap','Numerically estimate the mean squared displacement of an optically trapped microsphere at a specified time.'),
 't1167': ('One model, two configurations','Compute the Kolmogorov–Crespi potential for a bilayer atomic structure, with native checks for individual saved steps.'),
 't0611': ('Three views of spatial data','Plot spatial data by total counts, gene counts, and clusters, then combine the views into one figure.'),
 't0617': ('Subsidence and flood risk','Use projected elevation data to identify flood-prone areas, estimate potential building damage, and save the analysis plots.'),
 't0711': ('Restore a form length constraint','Fix a Django login form that fails to render the username field\'s maximum length attribute.'),
 't0713': ('Repair HTTP date parsing','Fix how Django\'s HTTP date parser interprets two-digit years.'),
 't0761': ('Book a flight under constraints','Complete a flight booking subject to departure time, cabin, baggage, and payment constraints.'),
 't0763': ('Change a reservation and rebook','Handle a request to remove a passenger or cancel a reservation, then rebook according to cost and itinerary preferences.'),
 't0811': ('Largest triangular pasture','Find the largest triangle whose vertices belong to a given point set and whose sides satisfy the axis-alignment constraints.'),
 't0814': ('Repeated range reversals','Compute the final permutation efficiently after a large number of repeated range reversals.'),
}
STEP_NAMES = {
 '66.1':'Generate monolayer graphene',
 '66.2':'Assign normal vectors',
 '66.3':'Compute repulsive potential',
 '66.4':'Compute attractive potential',
 '66.5':'Compute taper function',
 '66.6':'Compute total potential energy',
}
SID_TO_NAME = {'svc_4aac0c50f425':'tools', 'svc_a629d1be2d17':'zero'}

def register(path):
    path = Path(path)
    raw = path.read_bytes()
    try: name = str(path.relative_to(ROOT))
    except ValueError: name = path.name
    SOURCES[name] = {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    return raw

def read(path): return json.loads(register(path))

def read_csv(path):
    return list(csv.DictReader(register(path).decode('utf-8-sig').splitlines()))

def dump_csv(name, rows):
    with (DATA/name).open('w', encoding='utf-8', newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(rows[0]))
        writer.writeheader();writer.writerows(rows)

def dump(name, value):
    (DATA/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def rel(path): return str(Path(path).relative_to(ROOT))
def val(x): return None if x is None else float(x)
def rng(values):
    xs = [float(x) for x in values if x is not None]
    return {'min': min(xs) if xs else None, 'max': max(xs) if xs else None, 'known_count':len(xs)}

def score_record(r):
    return {'model':r['model'],'benchmark':r['benchmark'], 'q':r['quality_task_macro'],
            'e':r['cost_efficiency_case_pooled'],'oracle':r['confirmed_feasible_oracle_task_macro'],
            'task_packs':r['scored_tasks'],'valid_submissions':r['valid_scored_tasks'],
            'invalid_submissions':r['invalid_scored_tasks'],'main_cases':r['main_cases'],
            'feasible_cases':r['feasible_cases'],'all_fail_cases':r['all_fail_cases'],
            'feasible_hit_rate':r['feasible_hit_rate_case_pooled'],
            'h':r['feasible_hit_rate_case_pooled'],
            'c':r['cost_efficiency_case_pooled']/r['feasible_hit_rate_case_pooled'] if r['feasible_hit_rate_case_pooled'] else None}

def make_snapshot(pointer):
    summary=read(pointer['summary']); scope=read(pointer['evaluation_scope'])
    rows=[score_record(r) for r in summary['statistics']]
    first={r['benchmark']:r for r in rows if r['model']==scope['models'][0]}
    inventory=read_csv(BENCH/'framework_review_20261107/source_inventory.csv')
    inventory=[r for r in inventory if r['task_id'] in set(scope['task_ids'])]
    source_tasks=len({r['source_task_key'] for r in inventory})
    assert source_tasks==1116 and scope['task_count']==1180
    assert len(rows)==len(scope['models'])*10 and all(r['model'] in scope['models'] for r in rows)
    # A fixed denominator includes unsuccessful submissions. Never replace them
    # with predictions, or silently turn a partially observed run into valid-only scores.
    records=[json.loads(line) for line in register(pointer['results']).splitlines() if line]
    keys={(r['model'],r['task_id']) for r in records}
    expected={(m,t) for m in scope['models'] for t in scope['task_ids']}
    assert len(records)==len(keys)==len(expected) and keys==expected
    for model in scope['models']:
        selected=[r for r in records if r['model']==model]
        totals=next(r for r in rows if r['model']==model and r['benchmark']=='ALL')
        invalid=[r for r in selected if r['rewards']['valid_fraction']<1]
        assert len(invalid)==totals['invalid_submissions']
        assert all(r['rewards']['quality_lower']==0 and (r['rewards'].get('cost_efficiency') or 0)==0 for r in invalid)
        assert all(r['rewards']['unknown_pool']==0 for r in selected)
        assert abs(sum(r['rewards']['quality_lower'] for r in selected)/len(selected)-totals['q'])<1e-12
        eligible=sum(r['rewards']['efficiency_eligible_cases'] for r in selected)
        efficiency=sum((r['rewards'].get('cost_efficiency') or 0)*r['rewards']['efficiency_eligible_cases'] for r in selected)/eligible
        assert abs(efficiency-totals['e'])<1e-12
    benchmarks=[]
    for bid,name,category,label in BENCHMARKS:
        r=first[bid]
        benchmarks.append({'id':bid,'name':name,'category':category,'label':label,'label_en':label,
                           'task_packs':r['task_packs'],'source_tasks':len({x['source_task_key'] for x in inventory if x['benchmark']==bid}),
                           'main_cases':r['main_cases'],'feasible_cases':r['feasible_cases'],'oracle':r['oracle']})
    overall=[r for r in rows if r['benchmark']=='ALL']
    out={'meta':{'version':pointer['version'],'results_date':summary['created_at'][:10],'export_date':date.today().isoformat(),
                 'benchmark_count':len(benchmarks),'source_tasks':source_tasks,'task_packs':scope['task_count'],
                 'main_cases':first['ALL']['main_cases'],'feasible_cases':first['ALL']['feasible_cases'],
                 'all_fail_cases':first['ALL']['all_fail_cases'],'formal_models':len(scope['models']),
                 'recorded_selector_packages':len(records),'valid_submissions':sum(r['valid_submissions'] for r in overall),
                 'invalid_submissions':sum(r['invalid_submissions'] for r in overall),
                 'common_task_cohort':True,'model_comparison_scope':'recorded selector systems, not a controlled model-only comparison',
                 'score_scale':'fraction_0_1','cost_unit':'USD, recorded execution cost estimate','time_unit':'seconds, recorded execution or saved-output prefix',
                 'result_scope':'fixed_full_cohort','invalid_submission_policy':'zero, retained in denominator',
                 'q_aggregation':'mean of per-pack mean case qualification','e_aggregation':'mean over feasible main scenarios; unqualified selections score zero',
                 'oracle_aggregation':'same pack-macro aggregation as Q',
                 'h_aggregation':'qualified selections divided by feasible scenarios',
                 'c_aggregation':'mean relative cost efficiency among each selector\'s satisfied scenarios; null if none',
                 'protocol_note':'Existing completed runs include earlier tool-reading and later compact input protocols; CORE uses the uniform compact rerun.',
                 'excluded_task_ids':scope['excluded_task_ids'],'partial_models_in_main_ranking':False},
         'models':[{'id':m,'name':MODEL_NAMES[m],'color':COLORS[i]} for i,m in enumerate(scope['models'])],
         'benchmarks':benchmarks,'scores':rows}
    dump('benchmark.json',out)
    # Public downloads contain already-published aggregate tables only.
    for field,name in [('overall_csv','overall.csv'),('by_benchmark_csv','by_benchmark.csv'),('complete_table_csv','complete_scores.csv')]:
        src=Path(pointer[field]); SOURCES[rel(src)]={'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'bytes':src.stat().st_size}
        # Keep every data cell intact, translating the source table's two
        # presentation labels rather than copying its Chinese headings.
        with src.open(encoding='utf-8-sig',newline='') as stream:
            csv_rows=list(csv.reader(stream))
        translations={'\u4efb\u52a1\u6570':'Task_packs',
                      '\u5168\u90e8\uff08\u6309\u4efb\u52a1\u6c47\u603b\uff09':'All benchmarks'}
        with (DATA/name).open('w',encoding='utf-8',newline='') as stream:
            csv.writer(stream).writerows([[translations.get(cell,cell) for cell in row] for row in csv_rows])
    return scope

def make_analysis(pointer, scope, paper):
    """Export aggregate paper diagnostics only; no target-level choices or logs."""
    switching=read(paper/'data/objective_analysis/switching_summary.json')
    consistency=read(paper/'data/objective_analysis/monotonicity_summary.json')
    requirements=read(paper/'data/user_requirements/summary.json')
    for source_hash in [switching['source_results_sha256'],consistency['source_results']['sha256'],requirements['source_results_sha256']]:
        assert source_hash==pointer['results_sha256'], 'Paper analyses do not match the current results'
    assert len(switching['recomputed_frozen_metrics'])==len(scope['models'])
    assert all(r['frozen_metrics_match'] for r in switching['recomputed_frozen_metrics'])
    diagnostics=[]
    for model in scope['models']:
        required=next(r for r in switching['category_models'] if r['model']==model and r['category']=='satisfaction_requires_switch')
        mono=next(r for r in consistency['models'] if r['model']==model and r['stratum']=='strict_relaxation' and r['axis']=='overall')
        req=next(r for r in requirements['models'] if r['model']==model)
        diagnostics.append({'model':model,'q':req['Q_packmacro'],'h':req['feasible_hit'],
            'e':req['E_case_pooled'],'c':req['relative_efficiency_given_qualified'],
            'baseline_repeated_q':req['baseline_repeated_Q_packmacro'],
            'adaptation_gain_pp':req['baseline_profile_adaptation_Q_pp'],
            'required_groups':required['groups'],'required_group_switches':required['switching_groups_feasible_profiles'],
            'required_valid_groups':required['valid_feasible_groups'],
            'all_feasible_success':required['all_feasible_satisfied_groups'],
            'regressions':mono['regressions'],'regression_opportunities':mono['tight_qualified_opportunities'],
            'regression_rate':mono['regression_rate'],'regression_native':mono['regression_native'],
            'regression_resource':mono['regression_resource']})
    conditions=[]
    for axis in ['budget','deadline']:
        original=read_csv(paper/f'figure_redesign_20261110/budget/{axis}_condition_scores.csv')
        for row in original:
            assert row['axis']==axis
            conditions.append({'benchmark':row['benchmark'],'model':row['model'],'axis':axis,
                'quantile_percent':int(row['quantile_percent']),'task_packs':int(row['packs']),
                'targets':int(row['targets']),'scenarios':int(row['scenarios']),
                'q_exact':row['Q_exact'],'q':float(row['Q'])})
        for model in [*scope['models'],'observed_pool_oracle']:
            for quantile in [25,50,75,95]:
                parts=[r for r in conditions if r['axis']==axis and r['model']==model and r['quantile_percent']==quantile and r['benchmark']!='ALL']
                assert len(parts)==9
                count=sum(r['task_packs'] for r in parts)
                exact=sum(Fraction(r['q_exact'])*r['task_packs'] for r in parts)/count
                conditions.append({'benchmark':'ALL','model':model,'axis':axis,'quantile_percent':quantile,
                    'task_packs':count,'targets':sum(r['targets'] for r in parts),'scenarios':sum(r['scenarios'] for r in parts),
                    'q_exact':str(exact),'q':float(exact)})
    assert len(conditions)==720
    counts=switching['counts']
    analysis={
        'meta':{'version':pointer['version'],'source_results_sha256':pointer['results_sha256'],
                'scope':'Offline diagnostics of archived choices under the same frozen target facts; no new executions.',
                'score_scale':'fraction_0_1; adaptation_gain_pp is in percentage points',
                'groups_definition':switching['definitions']['group'],
                'baseline_comparison':'Reuse each selector\'s archived unconstrained choice for the same target; no new baseline inference.',
                'limitations':[switching['definitions']['interpretation'],consistency['dependence'],consistency['protocol_scope']]},
        'highlights':{'target_groups':counts['groups'],'feasible_target_groups':counts['feasible_groups'],
            'satisfaction_switch_required_groups':counts['satisfaction_switch_required_groups'],
            'minimum_cost_switch_required_groups':counts['satisfaction_and_minimum_cost_switch_required_groups'],
            'best_all_feasible_success':max(r['all_feasible_success'] for r in diagnostics),
            'adaptation_gain_pp_min':min(r['adaptation_gain_pp'] for r in diagnostics),
            'adaptation_gain_pp_max':max(r['adaptation_gain_pp'] for r in diagnostics),
            'regressions':sum(r['regressions'] for r in diagnostics),
            'regression_native':sum(r['regression_native'] for r in diagnostics),
            'regression_resource':sum(r['regression_resource'] for r in diagnostics),
            'strict_relaxation_edges':sum(r['edges'] for r in consistency['dataset_edges'] if r['stratum']=='strict_relaxation'),
            'cost_distinct_feasible_scenarios':requirements['dataset']['feasible_cases_with_cost_distinction']},
        'model_diagnostics':diagnostics,
        'switching':{k:switching[k] for k in ['definitions','counts','categories','category_models']},
        'consistency':{k:consistency[k] for k in ['units','rate_denominator','regression_definition','higher_cost_definition','invalid_handling','dependence','protocol_scope','counts','dataset_edges','models']},
        'requirements':{k:requirements[k] for k in ['scope','dataset','by_benchmark','models','cost_spread']},
        'conditions':conditions,
        'conditions_note':'For each axis, average over the other four resource levels within each target and then each package. ALL is weighted by benchmark package counts. Four condition means recover the main Q.'}
    dump('analysis.json',analysis)
    dump_csv('model_diagnostics.csv',diagnostics)
    dump_csv('condition_scores.csv',conditions)

def catalog():
    cat=read(read(BENCH/'private_scoring_catalog.json')['catalog'])['tasks']
    core=read(BENCH/'current_core_benchmark.json')
    cat.update(read(core['private_catalog'])['tasks'])
    return cat

def make_gallery(cat,scope):
    rows=[]
    bench_info={x[0]:x for x in BENCHMARKS}
    for tid,(title,description) in EXAMPLES.items():
        assert tid in scope['task_ids']
        gtpath=Path(cat[tid]['ground_truth']);gt=read(gtpath)
        contract='native.step:66.2' if tid=='t1167' else 'native.full'
        baseline=next(c for c in gt['cases'] if c['kind']=='baseline' and c['contract_id']==contract)
        facts=list(baseline['candidates'].values());bid=gt['task']['benchmark']
        main=[c for c in gt['cases'] if c['kind']=='constrained']
        def qualifies(f,c):
            lim=c['limits'];return f['native_status']=='pass' and Decimal(f['cost_usd'])<=Decimal(lim['budget_usd']) and Decimal(f['duration_seconds'])<=Decimal(lim['deadline_seconds'])
        feasible=sum(any(qualifies(f,c) for f in c['candidates'].values()) for c in main)
        rows.append({'id':tid,'task_id':tid,'source_task_key':gt['task']['source_task_key'],
                     'source_task_id':gt['task']['task_id'],'benchmark':bid,'benchmark_name':bench_info[bid][1],
                     'category':bench_info[bid][2],'title':title,'title_en':title,'description':description,
                     'text_kind':'benchmark-level description' if bid in ('gaia','online_mind2web') else 'curated paraphrase',
                     'original_task_text_included':False,'track':gt['task']['track'],'fold':gt['task']['fold'],
                     'candidate_count':len(gt['candidate_ids']),'native_pass_count':sum(f['native_status']=='pass' for f in facts),
                     'native_fail_count':sum(f['native_status']=='fail' for f in facts),'contract_id':contract,
                     'resource_scope':'saved_output_cumulative_prefix' if tid=='t1167' else 'recorded_whole_task_duration',
                     'cost_usd':rng(f['cost_usd'] for f in facts),'duration_seconds':rng(f['duration_seconds'] for f in facts),
                     'main_cases':len(main),'feasible_cases':feasible,'oracle_q':feasible/len(main),
                     'source':{'ground_truth':rel(gtpath),'sha256':SOURCES[rel(gtpath)]['sha256']}})
    assert len(rows)==18 and len({r['benchmark'] for r in rows})==9
    assert all(sum(x['benchmark']==b[0] for x in rows)==2 for b in BENCHMARKS)
    dump('gallery.json',{'description':'Curated retrospective examples; not a representative performance sample. GAIA and Online-Mind2Web contain identifiers and aggregates only.','examples':rows})

def make_scicode(cat):
    gtpath=Path(cat['t1167']['ground_truth']);gt=read(gtpath)
    taskroot=ROOT/'experiments/harbor_package_repair_20261031/release/tasks/t1167'
    brief=read(taskroot/'environment/public/brief.json')
    compact=BENCH/'history_cards_run_20261102/release/tasks/t1167'
    cards=read(compact/'history_cards.json');summary=read(compact/'history_summary.json')
    exact=read(compact/'qualification_exact.json');aliases=read(compact/'source_aliases.json')
    candidates=[{'id':SID_TO_NAME[s],'service_id':s,'alias':f'C{i+1}',
                 'model':'openai/o3-2025-04-16','harness':'Tool Calling' if SID_TO_NAME[s]=='tools' else 'Zero Shot'}
                for i,s in enumerate(gt['candidate_ids'])]
    steps=[]
    for cid,name in STEP_NAMES.items():
        c=next(c for c in gt['cases'] if c['kind']=='baseline' and c['contract_id']=='native.step:'+cid)
        obs={SID_TO_NAME[s]:{'native_pass':f['native_status']=='pass','native_status':f['native_status'],
                             'cost_usd':val(f['cost_usd']),'duration_seconds':val(f['duration_seconds'])}
             for s,f in c['candidates'].items()}
        steps.append({'id':cid,'name':name,'name_en':name,'contract_id':c['contract_id'],'candidates':obs})
    budgets=[{'id':r['id'],'quantile':val(r['quantile']),'value':val(r['budget_usd'])} for r in gt['profiles']['budget_levels']]
    deadlines=[{'id':r['id'],'quantile':val(r['quantile']),'value':val(r['deadline_seconds'])} for r in gt['profiles']['deadline_levels']]
    verifier_path=taskroot/'tests/verify.py'
    spec=importlib.util.spec_from_file_location('site_native_verifier',verifier_path);verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
    refs=[]
    for strategy in ['zero','tools','oracle']:
        decisions=[]
        for c in gt['cases']:
            if strategy=='oracle':
                allowed=[sid for sid,f in c['candidates'].items() if verifier.qualified(f,c['limits'])=='pass']
                sid=min(allowed,key=lambda s:Decimal(c['candidates'][s]['cost_usd'])) if allowed else gt['candidate_ids'][0]
            else:sid=next(s for s,n in SID_TO_NAME.items() if n==strategy)
            decisions.append({'case_id':c['case_id'],'service_id':sid})
        reward,_=verifier.score_submission(gt,{'decisions':decisions})
        assert reward['valid_fraction']==1 and reward['unknown_pool']==0
        refs.append({'strategy':strategy,'q':reward['quality_lower'],'e':reward['cost_efficiency'],
                     'qualified_cases':round(reward['quality_lower']*reward['main_cases']),
                     'main_cases':reward['main_cases'],'feasible_cases':reward['observed_feasible'],
                     'baseline_q':reward['baseline_quality_lower']})
    assert [r['qualified_cases'] for r in refs]==[21,4,22]
    hist=[]
    alias_names={c['alias']:c['id'] for c in candidates}
    for card in cards['selected']:
        assert card['fold']!=gt['task']['fold']
        hist.append({'source_task_key':card['source_task_key'],'fold':card['fold'],
                     'name':'Chern number parameter grid' if card['source_task_key']=='scicode:33' else 'Monte Carlo simulation',
                     'description':'Sweep physical parameters to construct a grid of Chern numbers.' if card['source_task_key']=='scicode:33' else 'Simulate a particle system using Monte Carlo methods.',
                     'native_full':[{'candidate':alias_names[alias],
                                     'native_status':next(status for status,arr in card['status_aliases'].items() if alias in arr),
                                     'cost_usd':val(cost),'duration_seconds':val(duration)}
                                    for alias,cost,duration in card['exact_resources']]})
    full_counts=next(r for r in exact['rows'] if r['group_id']=='G1' and r['profile']=='Q1')
    public_summary=[{'candidate':SID_TO_NAME[sid],'tasks':r['denominator'],'native_pass':r['counts'][0],
                     'native_fail':r['counts'][1],'native_unknown':r['counts'][2]}
                    for sid,r in zip(summary['candidate_order'],full_counts['candidate_counts'])]
    out={'task_id':'t1167','source_task_key':'scicode:66','title':'Kolmogorov–Crespi potential',
         'description':'Compute the interlayer potential from the atomic coordinates of two layers. The archived runs contain native checks for six steps: graphene geometry, normal vectors, repulsion, attraction, tapering, and total potential energy.',
         'mode':'retrospective_scoring_demonstration','not_router_visible_ground_truth':True,
         'model':'openai/o3-2025-04-16','candidates':candidates,'steps':steps,'budgets':budgets,'deadlines':deadlines,
         'units':{'cost_usd':'USD, cumulative estimated recorded cost','duration_seconds':'seconds, cumulative saved-output arrival'},
         'resource_scope':'saved_output_cumulative_prefix','requirements_source':'other four folds only; inverse weighted CDF P25/P50/P75/P95',
         'held_out_fold':gt['task']['fold'],'history_folds':gt['profiles']['split']['eligible_folds'],
         'history_task_count':summary['history_task_denominator'],'history_summary':public_summary,'history_cards':hist,
         'submission_shape':{'total_choices':len(gt['cases']),'main_choices':96,'baseline_choices':7,'format':'{"choices":["C1","C2",...]}','candidate_aliases':alias_names},
         'reference_scores':refs,'reference_note':'Deterministic reference submissions, not model blind-test scores; oracle uses hidden target facts.',
         'source':{'ground_truth':rel(gtpath),'ground_truth_sha256':SOURCES[rel(gtpath)]['sha256'],
                   'public_history_cards':rel(compact/'history_cards.json'),'verifier':rel(verifier_path)}}
    dump('scicode66.json',out)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.parse_args()
    DATA.mkdir(parents=True,exist_ok=True)
    pointer=read(BENCH/'current_score_results.json')
    results=Path(pointer['results']);assert hashlib.sha256(results.read_bytes()).hexdigest()==pointer['results_sha256']
    paper_pointer=read(ROOT/'current_paper.json')
    assert paper_pointer['scores_version']==pointer['version']
    paper=Path(paper_pointer['source_directory'])
    assert hashlib.sha256(Path(paper_pointer['paper']).read_bytes()).hexdigest()==paper_pointer['pdf_sha256']
    scope=make_snapshot(pointer);cat=catalog();make_gallery(cat,scope);make_scicode(cat)
    make_analysis(pointer,scope,paper)
    manifest={'version':2,'snapshot':pointer['version'],'generated_date':date.today().isoformat(),'source_paths_relative_to_repository':True,
              'results_sha256':pointer['results_sha256'],'export_policy':{
                  'allowlist_only':True,'raw_traces':False,'reference_answers':False,'attachments':False,'credentials':False,
                  'gaia_original_task_text':False,'mind2web_original_task_text':False,
                  'gallery_descriptions':'Curated short paraphrases except restricted benchmarks, which use generic benchmark-level descriptions.',
                  'gallery_ground_truth':'Aggregate retrospective display, not active router input.',
                  'scicode_ground_truth':'Six native step facts for an explicitly labelled worked scoring example.'},
              'paper':{'title':paper_pointer['title'],'revision':paper_pointer['revision'],
                       'path':rel(paper_pointer['paper']),'pdf_sha256':paper_pointer['pdf_sha256']},
              'sources':SOURCES,'checks':{'formal_models':len(scope['models']),'score_records':len(scope['models'])*10,
                                         'selector_package_records':len(scope['models'])*scope['task_count'],
                                         'benchmark_count':9,'gallery_examples':18,
                                         'scicode_reference_native_verifier':'passed; zero=21/96, tools=4/96, oracle=22/96',
                                         'scicode_history_folds_disjoint':True,'new_api_calls':0}}
    dump('source_manifest.json',manifest)
    print(json.dumps({'version':pointer['version'],'files':sorted(p.name for p in DATA.iterdir()),'formal_models':len(scope['models']),'gallery_examples':18,'new_api_calls':0},ensure_ascii=False))

if __name__=='__main__':main()
