# Benchmarking Agent Selection under Heterogeneous Objectives

**[Project website](https://chansl-lucky.github.io/agent-selection-benchmark/)** · **[Leaderboard](https://chansl-lucky.github.io/agent-selection-benchmark/#results)** · **[Behavioral analysis](https://chansl-lucky.github.io/agent-selection-benchmark/#analysis)** · **[Dataset](https://huggingface.co/datasets/PeterChan66/agent-selection-benchmark)** · **[Gallery](https://chansl-lucky.github.io/agent-selection-benchmark/gallery.html)** · **[Research question](https://chansl-lucky.github.io/agent-selection-benchmark/research.html)**

This repository hosts the English project website, manuscript, result visualizations, and compact exported evidence for the benchmark. It is the public release entry point; the complete task-package archive and benchmark runner will be released separately.

## Research overview

Agent selection must account for acceptance targets and execution conditions that vary within the same task context. Recorded native verdicts, costs, and durations define the satisfactory and minimum-cost candidate sets for each objective. These reference sets support evaluation of objective satisfaction, cost efficiency, necessary adaptation, and consistency under relaxed constraints.

The November 11, 2026 paper snapshot covers **9 task families, 1,116 source tasks, 1,180 packages, 22,240 constrained scenarios, and 8 recorded selector systems**. All eight systems use the same fixed evaluation cohort; invalid or missing submissions receive zero. Source tasks are split before constructing historical evidence.

- **Q:** average scenario satisfaction within each package, then across packages.
- **E:** minimum feasible execution cost divided by the selected feasible cost; unsuccessful selections score zero. Aggregate over feasible scenarios only.
- **Oracle Q:** observed-pool feasibility with the same aggregation as Q.
- **Adaptation:** scenario-specific choices versus reuse of each selector's unconstrained choice, plus full coverage in groups that require switching.
- **Consistency:** avoidable failures after a constraint is relaxed, witnessed by a previously satisfactory choice.

The leaderboard describes recorded selector systems, including their evidence-access and recovery protocols, rather than an identical-input model-only comparison. Original task executions are not rerun by this website.

## Explore the release

- `index.html`, `app.js`, `styles.css`, `academic.css`: academic project page and interactive results.
- `research.html`: research question and formulation.
- `gallery.html`, `case.html`, `gallery.js`, `gallery.css`: searchable gallery and standalone archived case pages.
- `assets/fonts/`: locally served Noto Sans and Google Sans, with their SIL Open Font Licenses.
- `scoring.js`: deterministic scoring for the SciCode 66 demonstration.
- `data/benchmark.json`: eight-selector overall and per-family scores.
- `data/analysis.json`: adaptation, switching, consistency, and resource-condition analyses.
- `data/*.csv`: downloadable tables.
- `assets/paper.pdf`: current manuscript; this is not an arXiv publication link.
- `assets/*.svg` and `assets/*.pdf`: current paper figures.
- `dataset.html`: data-release status and available exports.

The gallery's target outcomes are retrospective examples for explanation; target execution facts are excluded from evaluated selector inputs. The full task archive is not included in this initial website release.

## Run locally

```sh
python3 -m http.server 18765 --bind 127.0.0.1
```

Open `http://127.0.0.1:18765/`. The page reads local JSON over HTTP and makes no model API calls. It uses relative paths and can be hosted under a GitHub Pages project URL.

## Build and verify

```sh
node scripts/check_scores.mjs
python3 scripts/build_static.py
```

The static builder creates a clean `dist/` from `publish_manifest.json`. `scripts/export_data.py` is a reproducibility utility for the original research workspace and requires its archived inputs; viewing the published site does not require them.

GitHub Pages serves the root of the **`gh-pages`** branch. The **`main`** branch retains the site source and validation utilities. The runtime uses no credentials or analytics.

Page organization was inspired by [EduIllustrate](https://ecnu-innospark.github.io/EduIllustrate/). The site content and experimental results belong to this benchmark. Local font licensing is recorded in `assets/fonts/` (Noto Sans and Google Sans) and `assets/FONT-LICENSE.txt` (legacy assets); upstream task-data terms will accompany the separate dataset release.
