#!/usr/bin/env python3
"""Render the current public Q/E and budget figures; never modify paper sources.

Reads only the website's aggregate JSON. Run after add_laya_results.py with the
figure Python environment (matplotlib, numpy, pymupdf). Native task executions
and archived model predictions are not rerun.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import hashlib
import itertools
import json
import math

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle
import numpy as np
import pymupdf

SITE = Path(__file__).resolve().parents[1]
ASSETS = SITE / 'assets'
REVIEW = SITE / 'review/laya-update-20261125'
WIDTH_CM = 16.0
BENCHMARKS = ['assistantbench', 'corebench_hard', 'gaia', 'online_mind2web',
              'scicode', 'scienceagentbench', 'swebench_verified_mini',
              'taubench_airline', 'usaco']
SHORT_BENCH = ['Assistant', 'CORE', 'GAIA', 'Mind2Web', 'SciCode',
               'ScienceAgent', 'SWE-mini', 'τ-Airline', 'USACO']
FULL_BENCH = ['AssistantBench', 'CORE-Bench Hard', 'GAIA', 'Online-Mind2Web',
              'SciCode', 'ScienceAgentBench', 'SWE-bench Verified Mini',
              'τ-bench Airline', 'USACO']
SHORT_MODELS = {'gpt-6.1-sol': 'GPT', 'claude-sonnet-5-5': 'Claude',
                'gemini-3.8-flash': 'Gemini', 'qwen3-vl-plus': 'Qwen',
                'glm-5.3': 'GLM', 'deepseek-v4.1-flash': 'DeepSeek',
                'kimi-k3.1-pro': 'Kimi', 'doubao-seed-2.1-pro': 'Doubao',
                'laya': 'Laya-S1'}
MARKERS = ['o', 's', '^', 'v', 'P', 'D', 'X', '*', 'p']
INK = '#183C40'
ORACLE = 'observed_pool_oracle'
X = [25, 50, 75, 95]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percent_label(value):
    return str((Decimal(str(value)) * 100).quantize(Decimal('.1'), rounding=ROUND_HALF_UP))


def configure_fonts():
    # Use the same bundled fonts as the already-published paper figures.
    font_root = SITE.parent / 'paper_refine_20261108_v1/assets/fonts'
    paths = [font_root / f'LiberationSerif-{weight}.ttf'
             for weight in ['Regular', 'Bold', 'Italic', 'BoldItalic']]
    for path in paths:
        assert path.is_file(), f'Missing figure font: {path}'
        font_manager.fontManager.addfont(path)
    plt.rcParams.update({
        'font.family': 'Liberation Serif', 'font.size': 7.5, 'font.weight': 'bold',
        'axes.labelsize': 8.1, 'axes.titlesize': 8.5,
        'axes.labelweight': 'bold', 'axes.titleweight': 'bold',
        'xtick.labelsize': 7.5, 'ytick.labelsize': 7.5, 'legend.fontsize': 7.5,
        'axes.linewidth': .85, 'axes.edgecolor': '#486A67',
        'text.color': INK, 'axes.labelcolor': INK,
        'xtick.color': INK, 'ytick.color': INK,
        'figure.facecolor': '#FFFFFF', 'axes.facecolor': '#FFFFFF',
        'pdf.fonttype': 42, 'ps.fonttype': 42,
        # Outline SVG glyphs so browser font availability cannot shift labels.
        'svg.fonttype': 'path', 'svg.hashsalt': 'laya-main-results-20261125',
    })
    return {str(p.relative_to(SITE.parent)): sha(p) for p in paths}


def validate_pdf(path, height_cm):
    with pymupdf.open(path) as doc:
        assert len(doc) == 1
        page = doc[0]
        assert abs(page.rect.width * 2.54 / 72 - WIDTH_CM) < .001
        assert abs(page.rect.height * 2.54 / 72 - height_cm) < .001
        spans = [span for block in page.get_text('dict', clip=pymupdf.INFINITE_RECT())['blocks']
                 if 'lines' in block for line in block['lines'] for span in line['spans']
                 if span['text'].strip()]
        assert spans and min(s['size'] for s in spans) >= 7.3 - .001
        outside = [s['text'] for s in spans if s['bbox'][0] < -.01 or s['bbox'][1] < -.01
                   or s['bbox'][2] > page.rect.width + .01
                   or s['bbox'][3] > page.rect.height + .01]
        assert not outside, outside
        overlaps = []
        for first, second in itertools.combinations(spans, 2):
            overlap = pymupdf.Rect(first['bbox']) & pymupdf.Rect(second['bbox'])
            if not overlap.is_empty and overlap.width > .2 and overlap.height > .2:
                overlaps.append([first['text'], second['text']])
        assert not overlaps, overlaps
        assert not page.get_images(full=True)
        embedded = []
        for font in page.get_fonts(full=True):
            name, ext, kind, content = doc.extract_font(font[0])
            assert 'LiberationSerif' in name and content
            embedded.append(name)
        assert embedded
        return {'passed': True, 'minimum_font_pt': min(s['size'] for s in spans),
                'out_of_bounds': outside, 'overlapping_text': overlaps,
                'embedded_fonts': embedded, 'raster_images': 0}


def export(fig, stem, title, height_cm):
    prefix = ASSETS / stem
    fig.savefig(prefix.with_suffix('.pdf'), metadata={'Title': title, 'Creator': 'Matplotlib',
                                                     'CreationDate': None, 'ModDate': None})
    fig.savefig(prefix.with_suffix('.svg'), metadata={'Title': title, 'Date': None})
    svg_path = prefix.with_suffix('.svg')
    svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text().splitlines()) + '\n')
    fig.savefig(REVIEW / f'{stem}.png', dpi=300)
    plt.close(fig)
    return {'size_cm': [WIDTH_CM, height_cm],
            'html_ratio_at_width_1200': [1200, round(1200 * height_cm / WIDTH_CM)],
            'validation': validate_pdf(prefix.with_suffix('.pdf'), height_cm),
            'outputs': {ext: sha(prefix.with_suffix('.' + ext)) for ext in ['svg', 'pdf']}}


def draw_comparison(models, scores):
    n = len(models)
    fig = plt.figure(figsize=(WIDTH_CM / 2.54, 9.5 / 2.54))
    cmap = LinearSegmentedColormap.from_list('paper_teal',
        ['#F4FBF7', '#D6EFE4', '#A2D7C6', '#55B49F', '#00645F'])
    norm = Normalize(vmin=0, vmax=100)
    rects = [[.170, .555, .735, .315], [.170, .073, .735, .315]]
    evidence = {}
    for index, (metric, rect, title, subtitle) in enumerate(zip(
            ['q', 'e'], rects, ['(a) Objective satisfaction Q', '(b) Cost efficiency E'],
            ['Package-macro · all scenarios', 'Pooled · feasible scenarios'])):
        values = np.array([[scores[m['id'], b][metric] * 100 for m in models] for b in BENCHMARKS])
        labels = [[percent_label(scores[m['id'], b][metric]) for m in models] for b in BENCHMARKS]
        ax = fig.add_axes(rect)
        ax.pcolormesh(np.arange(n + 1), np.arange(10), values, cmap=cmap,
                      norm=norm, edgecolors='white', linewidth=.9)
        ax.set_xlim(0, n); ax.set_ylim(9, 0)
        ax.set_xticks(np.arange(n) + .5, [SHORT_MODELS[m['id']] for m in models])
        for label, model in zip(ax.get_xticklabels(), models): label.set_color(model['color'])
        ax.set_yticks(np.arange(9) + .5, SHORT_BENCH)
        ax.tick_params(axis='both', length=0, pad=4)
        for spine in ax.spines.values(): spine.set_visible(False)
        for row in range(9):
            best = values[row].max()
            for col in range(n):
                value = values[row, col]
                if abs(value - best) < 1e-9:
                    ax.add_patch(Rectangle((col + .035, row + .035), .93, .93,
                        facecolor='none', edgecolor='#007F78', linewidth=.95))
                ax.text(col + .5, row + .5, labels[row][col], ha='center', va='center',
                        fontsize=7.5, weight='bold', color='white' if value >= 80 else INK)
        fig.text(rect[0], [.977, .495][index], title, fontsize=8.5, weight='bold', va='top')
        fig.text(rect[0], [.930, .448][index], subtitle, fontsize=7.5, color='#53616A', va='top')
        evidence[metric] = {'values_percent': values.tolist(), 'displayed_values': labels}
    cax = fig.add_axes([.930, .073, .016, .797])
    bar = fig.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=cax, ticks=[0, 25, 50, 75, 100])
    bar.solids.set_rasterized(False); bar.outline.set_visible(False)
    bar.ax.tick_params(length=0, pad=3, labelsize=7.5)
    fig.text(.938, .930, 'Score', ha='center', fontsize=7.5, color='#53616A', va='top')
    evidence.update(export(fig, 'selector_comparison', 'Nine-selector objective satisfaction and cost efficiency', 9.5))
    return evidence


def draw_budget(models, conditions):
    rows = [r for r in conditions if r['axis'] == 'budget' and r['benchmark'] in BENCHMARKS]
    lookup = {(r['benchmark'], r['model'], r['quantile_percent']): r['q'] * 100 for r in rows}
    assert len(rows) == len(lookup) == 9 * (len(models) + 1) * 4
    fig, axes = plt.subplots(3, 3, figsize=(WIDTH_CM / 2.54, 11.7 / 2.54))
    fig.subplots_adjust(left=.080, right=.990, bottom=.10, top=.875, wspace=.22, hspace=.48)
    panels = []
    for i, (ax, benchmark, title) in enumerate(zip(axes.flat, BENCHMARKS, FULL_BENCH)):
        oracle = [lookup[benchmark, ORACLE, q] for q in X]
        maximum = max(oracle)
        step = 5 if maximum < 20 else 10 if maximum < 40 else 20 if maximum < 80 else 25
        upper = min(100, max(step, step * math.ceil(maximum * 1.055 / step)))
        ax.fill_between(X, 0, oracle, color='#B3B8BE', alpha=.115, linewidth=0, zorder=0)
        ax.plot(X, oracle, color='#565B62', linestyle=(0, (3, 2.1)), linewidth=1.25,
                marker='D', markersize=3.7, markerfacecolor='white', markeredgewidth=.85,
                clip_on=False, zorder=2)
        for model, marker in zip(models, MARKERS):
            y = [lookup[benchmark, model['id'], q] for q in X]
            assert all(a <= b + 1e-9 for a, b in zip(y, oracle))
            ax.plot(X, y, color=model['color'], marker=marker, markersize=4.2,
                    linewidth=1.4, markeredgecolor='white', markeredgewidth=.45,
                    clip_on=False, zorder=3)
        ax.set_xlim(21, 99); ax.set_ylim(0, upper)
        ax.set_xticks(X); ax.set_yticks(np.arange(0, upper + .01, step))
        ax.tick_params(length=2.7, width=.7, pad=1.8)
        ax.grid(axis='both', color='#C6D3D0', linestyle=(0, (1.4, 1.8)), linewidth=.5, zorder=-1)
        ax.spines[['top', 'right']].set_visible(False)
        ax.set_title(f'({chr(97 + i)}) {title}', loc='left', pad=3.5, fontweight='bold')
        panels.append({'benchmark': benchmark, 'y_limits': [0, upper],
                       'curves': {m: [lookup[benchmark, m, q] for q in X]
                                  for m in [*[m['id'] for m in models], ORACLE]}})
    handles = [Line2D([0], [0], color=m['color'], marker=marker, markersize=4.5,
                     linewidth=1.4, markeredgecolor='white', markeredgewidth=.45,
                     label=SHORT_MODELS[m['id']]) for m, marker in zip(models, MARKERS)]
    handles.append(Line2D([0], [0], color='#565B62', linestyle=(0, (3, 2.1)), marker='D',
                         markersize=3.7, markerfacecolor='white', markeredgewidth=.85,
                         linewidth=1.25, label='Observed-pool oracle'))
    fig.legend(handles=handles, loc='upper center', bbox_to_anchor=(.53, .994), ncol=5,
               frameon=False, handlelength=1.65, handletextpad=.45, columnspacing=1.0, borderaxespad=0)
    fig.text(.017, .495, 'Satisfaction Q (%)', rotation=90, va='center', ha='center', fontsize=8.2)
    fig.text(.54, .037, 'Budget percentile', ha='center', va='center', fontsize=8.2)
    result = {'panels': panels, 'percentiles': X, 'points': len(rows)}
    result.update(export(fig, 'budget_conditions', 'Nine-selector satisfaction under budget constraints', 11.7))
    return result


def main():
    benchmark_path = SITE / 'data/benchmark.json'
    analysis_path = SITE / 'data/analysis.json'
    benchmark = json.loads(benchmark_path.read_text())
    analysis = json.loads(analysis_path.read_text())
    models = benchmark['models']
    assert len(models) == 9 and models[-1]['id'] == 'laya' and models[-1]['name'] == 'Laya-S1'
    assert len({m['id'] for m in models}) == 9
    scores = {(r['model'], r['benchmark']): r for r in benchmark['scores']}
    assert len(scores) == 90 and len(analysis['conditions']) == 800
    for (model, bench), row in scores.items():
        assert 0 <= row['q'] <= row['oracle'] + 1e-12 and 0 <= row['e'] <= 1
        for axis in ['budget', 'deadline']:
            cs = [r for r in analysis['conditions'] if r['model'] == model
                  and r['benchmark'] == bench and r['axis'] == axis]
            assert len(cs) == 4 and abs(sum(r['q'] for r in cs) / 4 - row['q']) < 1e-11
    assert abs(scores['laya', 'ALL']['q'] - .24427217850417005) < 1e-12
    assert abs(scores['laya', 'ALL']['e'] - .3358534258627963) < 1e-12
    REVIEW.mkdir(parents=True, exist_ok=True)
    inputs = {'benchmark.json': sha(benchmark_path), 'analysis.json': sha(analysis_path)}
    fonts = configure_fonts()
    audit = {'status': 'passed', 'models': [m['id'] for m in models],
             'model_names': [m['name'] for m in models], 'input_hashes': inputs,
             'benchmarks': BENCHMARKS, 'font_hashes': fonts,
             'metric_cells': 162, 'scores_match_public_tables': True,
             'four_budget_and_deadline_point_means_match_main_Q': True,
             'new_model_calls': 0, 'paper_sources_modified': False,
             'selector_comparison': draw_comparison(models, scores),
             'budget_conditions': draw_budget(models, analysis['conditions'])}
    assert sha(benchmark_path) == inputs['benchmark.json'] and sha(analysis_path) == inputs['analysis.json']
    (REVIEW / 'main_figures_audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'models': len(models), 'metric_cells': 162,
                      'budget_points': 360, 'comparison_ratio': [1200, 713], 'budget_ratio': [1200, 878]}))


if __name__ == '__main__':
    main()
