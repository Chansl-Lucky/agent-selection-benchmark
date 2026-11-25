#!/usr/bin/env python3
"""Append the verified external-SFT Laya result to the website's main experiment.

Requires the archived research workspace. Reuses recorded scores; no inference,
training, or task execution is performed. The eight API systems and the separate
eight-system behavioral analyses are preserved verbatim as JSON/CSV values.
"""
from collections import defaultdict
import csv
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
from hashlib import sha256
import io
import json
from math import fsum, isclose
from pathlib import Path
import re

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
RUN = ROOT / 'research/laya_external_routing/mixed_external/large_pool_dataset/sft_v1'
BOARD = RUN / 'board'
DATA = SITE / 'data'
MODEL = 'laya'
SOURCE_MODEL = 'Laya-421M-external-large-pool-SFT'
VERSION = 'nine_selectors_laya_20261125'
BASE_VERSION = 'complete_eight_model_cohort_20261110'
DATE = '2026-11-25'


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def csv_rows(path):
    with path.open(newline='') as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def csv_text(fields, rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def close(a, b):
    assert isclose(float(a), float(b), rel_tol=1e-11, abs_tol=1e-12), (a, b)


def display_percent(value):
    """Match JavaScript's (value * 100).toFixed(2) for nonnegative scores."""
    return format(Decimal.from_float(float(value) * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), '.2f')


def main():
    audit = read(BOARD / 'score_audit.json')
    summary = audit['summary']
    assert summary['model'] == SOURCE_MODEL
    assert (summary['packs'], summary['valid_packs'], summary['constrained_cases'],
            summary['feasible_cases'], summary['baseline_cases']) == (1180, 1180, 22240, 11589, 1454)
    for name, expected in audit['file_sha256'].items():
        assert digest(BOARD / name) == expected, name

    sources = [BOARD / 'score_audit.json', BOARD / 'by_benchmark.csv',
               BOARD / 'comparison.csv', BOARD / 'per_package.csv', RUN / 'fit/complete.json',
               RUN / 'dev/dev_metrics.json', RUN / 'dev/heldout_input_audit.json']
    cases = []
    for fold in range(5):
        folder = BOARD / f'fold{fold}'
        receipt = read(folder / 'score_audit.json')
        path = folder / 'laya_scored_cases.jsonl'
        assert digest(path) == receipt['scored_cases_sha256']
        assert receipt['checkpoint_sha256'] == audit['weight_sha256']
        cases.extend(json.loads(line) for line in path.open())
        sources.extend([path, folder / 'score_audit.json'])
    assert len(cases) == len({(r['tid'], r['id']) for r in cases}) == 23694
    constrained = [r for r in cases if r['kind'] == 'constrained']
    baseline = [r for r in cases if r['kind'] == 'baseline']
    assert len(constrained) == 22240 and len(baseline) == 1454
    assert sum(bool(r['feasible']) for r in constrained) == 11589
    assert all(r['Q'] == int(r['service_id'] in r['feasible']) for r in constrained)

    packs = defaultdict(list)
    bases = defaultdict(list)
    for row in constrained:
        packs[row['tid']].append(row)
    for row in baseline:
        bases[row['tid']].append(row)
    assert len(packs) == 1180
    close(fsum(fsum(r['Q'] for r in group) / len(group) for group in packs.values()) / len(packs), summary['Q'])
    close(fsum(r['E'] for r in constrained if r['feasible']) / 11589, summary['E'])

    benchmark = read(DATA / 'benchmark.json')
    old_models = [m for m in benchmark['models'] if m['id'] != MODEL]
    old_scores = [r for r in benchmark['scores'] if r['model'] != MODEL]
    assert len(old_models) == 8 and len(old_scores) == 80
    api_ids = {m['id'] for m in old_models}
    _, comparison = csv_rows(BOARD / 'comparison.csv')
    official_api = {r['model']: r for r in comparison if r['model'] in api_ids}
    assert len(official_api) == 8
    for row in old_scores:
        if row['benchmark'] == 'ALL':
            close(row['q'], official_api[row['model']]['Q'])
            close(row['e'], official_api[row['model']]['E'])

    _, native = csv_rows(BOARD / 'by_benchmark.csv')
    summaries = {r['benchmark']: r for r in native}
    summaries['ALL'] = summary
    bench_ids = [b['id'] for b in benchmark['benchmarks']]
    assert set(summaries) == set(bench_ids) | {'ALL'}
    additions = []
    for name in ['ALL'] + bench_ids:
        row = summaries[name]
        q, e, hits, feasible = float(row['Q']), float(row['E']), int(row['quality_hits']), int(row['feasible_cases'])
        h = hits / feasible
        additions.append({'model': MODEL, 'benchmark': name, 'q': q, 'e': e,
                          'oracle': float(row['oracle_Q']), 'task_packs': int(row['packs']),
                          'valid_submissions': int(row['valid_packs']), 'invalid_submissions': int(row['invalid_packs']),
                          'main_cases': int(row['constrained_cases']), 'feasible_cases': feasible,
                          'all_fail_cases': int(row['all_fail_cases']), 'feasible_hit_rate': h, 'h': h,
                          'c': e / h if h else None})
    benchmark['models'] = old_models + [{'id': MODEL, 'name': 'Laya', 'color': '#BA4D13'}]
    benchmark['scores'] = old_scores + additions
    benchmark['meta'].update(version=VERSION, base_api_version=BASE_VERSION, results_date=DATE,
                             export_date=DATE, formal_models=9, recorded_selector_packages=10620,
                             valid_submissions=10446, invalid_submissions=174)

    analysis = read(DATA / 'analysis.json')
    protected_analysis = {k: v for k, v in analysis.items() if k != 'conditions'}
    existing_conditions = [r for r in analysis['conditions'] if r['model'] != MODEL]
    assert len(existing_conditions) == 720
    conditions = []
    for name in bench_ids + ['ALL']:
        selected = {tid: rows for tid, rows in packs.items() if name == 'ALL' or rows[0]['benchmark'] == name}
        for axis, column in [('budget', 0), ('deadline', 1)]:
            for level in (25, 50, 75, 95):
                values = []
                targets = set()
                count = 0
                for tid, rows in selected.items():
                    subset = [r for r in rows if int(re.search(r'B(\d+)_D(\d+)$', r['id']).group(column + 1)) == level]
                    assert subset
                    values.append(Fraction(sum(r['Q'] for r in subset), len(subset)))
                    targets.update((tid, r['contract']) for r in subset)
                    count += len(subset)
                value = sum(values) / len(values)
                conditions.append({'benchmark': name, 'model': MODEL, 'axis': axis, 'quantile_percent': level,
                                   'task_packs': len(selected), 'targets': len(targets), 'scenarios': count,
                                   'q_exact': str(value), 'q': float(value)})
            close(fsum(r['q'] for r in conditions if r['benchmark'] == name and r['axis'] == axis) / 4, summaries[name]['Q'])
    assert len(conditions) == 80
    analysis['conditions'] = existing_conditions + conditions
    assert {k: v for k, v in analysis.items() if k != 'conditions'} == protected_analysis
    analysis['meta']['conditions_version'] = VERSION

    fields, wide = csv_rows(DATA / 'complete_scores.csv')
    fields = [x for x in fields if x not in ('Laya_Q', 'Laya_E')]
    old_wide = [{k: v for k, v in row.items() if k in fields} for row in wide]
    names = {b['name']: b['id'] for b in benchmark['benchmarks']}
    names['All benchmarks'] = 'ALL'
    for row in wide:
        score = summaries[names[row['Benchmark']]]
        row.update(Laya_Q=display_percent(score['Q']), Laya_E=display_percent(score['E']))
    assert [{k: row[k] for k in fields} for row in wide] == old_wide

    csv_outputs = {'complete_scores.csv': csv_text(fields + ['Laya_Q', 'Laya_E'], wide)}
    def long_row(name):
        selected = {tid: rows for tid, rows in packs.items() if name == 'ALL' or rows[0]['benchmark'] == name}
        rows = [r for group in selected.values() for r in group]
        row = summaries[name]
        pack_e = [fsum(r['E'] for r in group if r['feasible']) / sum(bool(r['feasible']) for r in group)
                  for group in selected.values() if any(r['feasible'] for r in group)]
        n = len(selected)
        feasible, hits, total = int(row['feasible_cases']), int(row['quality_hits']), len(rows)
        # package_row in the audited upstream scorer asserts QU == Q and unknown_pool == 0.
        return {'scope': 'fixed_full_cohort', 'version': VERSION, 'model': MODEL, 'benchmark': name,
                'scored_tasks': n, 'valid_scored_tasks': n, 'invalid_scored_tasks': 0,
                'main_cases': total, 'feasible_cases': feasible, 'efficiency_eligible_cases': feasible,
                'quality_task_macro': float(row['Q']), 'quality_upper_task_macro': float(row['Q']),
                'quality_case_pooled': hits / total, 'confirmed_feasible_oracle_task_macro': float(row['oracle_Q']),
                'feasible_hit_rate_case_pooled': hits / feasible, 'avoidable_miss_rate_case_pooled': 1 - hits / feasible,
                'cost_efficiency_case_pooled': float(row['E']), 'cost_efficiency_coverage_case_pooled': feasible / total,
                'cost_efficiency_eligible_task_macro': fsum(pack_e) / len(pack_e) if pack_e else None,
                'native_cost_efficiency_all_task_macro': fsum(pack_e) / n,
                'no_efficiency_evidence_tasks': n - len(pack_e), 'all_fail_cases': total - feasible,
                'unknown_pool_cases': 0, 'baseline_quality_task_macro': float(row['baseline_quality_task_macro'])}
    for filename, names_to_add in [('overall.csv', ['ALL']), ('by_benchmark.csv', bench_ids)]:
        headers, existing = csv_rows(DATA / filename)
        existing = [r for r in existing if r['model'] != MODEL]
        assert {r['model'] for r in existing} == api_ids
        new_rows = [long_row(name) for name in names_to_add]
        assert all(set(row) == set(headers) for row in new_rows)
        csv_outputs[filename] = csv_text(headers, existing + new_rows)
    headers, existing = csv_rows(DATA / 'condition_scores.csv')
    existing = [r for r in existing if r['model'] != MODEL]
    assert len(existing) == 720
    csv_outputs['condition_scores.csv'] = csv_text(headers, existing + conditions)

    fit = read(RUN / 'fit/complete.json')
    dev = read(RUN / 'dev/heldout_input_audit.json')
    assert (fit['training_subjects'], fit['epochs'], fit['updates'], dev['packages']) == (161, 1, 322, 41)
    scorer = ROOT / 'research/laya_api_hard_cases_20261122/full_sft_fold0/score_fold0.py'
    sources.append(scorer)
    provenance = {str(p.relative_to(ROOT)): {'sha256': digest(p), 'bytes': p.stat().st_size} for p in sources}
    release = {'version': VERSION, 'date': DATE, 'model': MODEL, 'display_name': 'Laya',
               'source_model': SOURCE_MODEL, 'checkpoint_sha256': audit['weight_sha256'],
               'training': {'base': 'Laya-421M', 'external_train_tasks': 161, 'external_dev_tasks': 41,
                            'train_scenarios': 2576, 'dev_scenarios': 656, 'epochs': 1, 'updates': 322,
                            'board_target_outcomes_used_for_training': False,
                            'board_usage': 'Repeatedly consulted evaluation board; not a fresh untouched test set.'},
               'evaluation': {'task_packs': 1180, 'valid_submissions': 1180, 'source_tasks': 1116,
                              'constrained_scenarios': 22240, 'feasible_scenarios': 11589,
                              'q': float(summary['Q']), 'e': float(summary['E']),
                              'input_protocol': 'Frozen per-question inputs and candidate ordering; native selection head.'},
               'api_results': {'models': 8, 'reused_unchanged': True, 'version': BASE_VERSION},
               'website_scope': 'Main Q/E results, per-benchmark tables, and budget/deadline Q curves only.',
               'paper_includes_laya': False, 'sources': provenance}
    source_manifest = read(DATA / 'source_manifest.json')
    source_manifest.update(snapshot=VERSION, base_api_snapshot=BASE_VERSION, generated_date=DATE)
    source_manifest['sources'].update(provenance)
    source_manifest['checks'].update(formal_models=9, score_records=90, selector_package_records=10620,
                                     laya_valid_packages=1180, laya_source_scores_verified=True,
                                     original_eight_api_rows_unchanged=True)
    source_manifest['laya_release'] = {'file': 'data/laya_release.json', 'source_model': SOURCE_MODEL,
                                       'checkpoint_sha256': audit['weight_sha256']}

    outputs = {'benchmark.json': benchmark, 'analysis.json': analysis,
               'laya_release.json': release, 'source_manifest.json': source_manifest}
    for name, content in outputs.items():
        (DATA / name).write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n')
    for name, content in csv_outputs.items():
        (DATA / name).write_text(content)
    review = SITE / 'review/laya-update-20261125'
    review.mkdir(parents=True, exist_ok=True)
    report = {'status': 'passed', 'version': VERSION, 'source_model': SOURCE_MODEL,
              'q': summary['Q'], 'e': summary['E'], 'packs': len(packs), 'main_cases': len(constrained),
              'feasible_cases': 11589, 'added_score_rows': 10, 'added_condition_rows': 80,
              'original_api_scores_unchanged': True, 'behavioral_analyses_unchanged': True,
              'source_files_verified': len(provenance), 'sources': provenance,
              'export_sha256': {name: digest(DATA / name) for name in list(outputs) + list(csv_outputs)}}
    (review / 'source_audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ('sources', 'export_sha256')}, indent=2))


if __name__ == '__main__':
    main()
