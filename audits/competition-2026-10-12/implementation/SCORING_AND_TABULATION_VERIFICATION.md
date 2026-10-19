# Scoring and tabulation verification

Updated October13,2026. The implementation repairs eligibility/integrity and receiving state while preserving published arithmetic and historical snapshots.

```text
Normalized minor = raw / frozen maximum × 100
Major contribution = mean(normalized minors) × parent percentage / 100
Judge total = round(sum(unrounded major contributions), configured precision)
Official round result = configured aggregation of complete submitted judge totals
Overall = existing back_to_zero / weighted / carry_forward rule
Rank = existing direction + approved adjustments/tie/division scope
```

Saved minimum validates the input; normalization still does not subtract it. Minors remain equally weighted within the parent. Output rounding remains exact rational half-away-from-zero. Missing required scores remain null/unranked, never silently zero. A genuine zero within configured bounds remains valid.

For maxima40/30/20/10 and parent weights40/30/20/10, raw36/27/18/9 contributes36/27/18/9 and totals90. Three complete judge totals90/86/92 yield average89.33, sum268, highest92, or trimmed90 when one low/high total is removed. Rank-based sums standard tied placements and lower wins; manual positive ranks remain explicit independently approved decisions. Shared ties use1,1,3; TopN includes all cutoff ties. perDivision continues to restart automatic ranking/advancement scope.

## Repaired championship field

The weighted branch now selects approved eligible finalists, not all historical round entrants. Actual engine and real SQL source fixture: Preliminary A100/B90; Top1 approves A; Final A0; Final deduction10;40%/60% gives **A34/rank1 only**, ready=true. B's Preliminary source remains saved but is not a championship candidate. Missing applicable finalist round sources produce null/unready. Empty unconfirmed Final cannot crown Preliminary-only data. Back-to-zero/carry-forward, category weights, special exclusions, methods and ties retain regression coverage.

## Trusted sources and revisions

Drafts and criterion locks are not official completed rounds. Submit Round snapshots current eligible locked sources/version. SQL tests exercised valid zero, out-of-date draft rejection, duplicate Lock/Submit, two competing connections and failure injected into projection insertion: JSON/projection/history/draft deletion roll back together.

Correction requires reason+confirmation, retains old snapshot sources and lock history, invalidates old submission and creates a new relock/submission version. Earlier verified/finalized/published/advancement constraints remain guarded.

100 stores/checks event source input revision at calculation INSERT and every official transition/advancement under event lock. SQL acceptance rejects old setup after omitted-field/account changes; stale calculation INSERT; finalized publication after approved deduction; stale finalized advancement after account change; result/source-identity edits. It also completes fresh submitted sources → adjusted exact calculation → independent Verify → Finalize → Publish, then checks event completion and closed submission window.

Manual calculation rejects unknown/foreign round before insert and accepts exactly the effective eligible selected scope. The UI consumes that field. Official published reads preserve snapshot rank/value; division filters and CSV exports retain scope and null/manual semantics.

Exact test evidence is in [TEST_RESULTS.md](TEST_RESULTS.md). Actual deployed Supabase installation, authenticated browser pipeline and external spreadsheet recalculation remain release checks; pure arithmetic and local RPC evidence do not establish those outcomes.
