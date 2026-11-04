# Standalone Pi primary-runtime preparation evidence

This is a provider-free pre-publication check, not registry publication or a live
installation claim. Source starts at `f682329`; the packaging changes add the
reviewed runtime patch, its MIT license and preparation guide to the independent
Pi tarball. Historical identity/lifecycle snapshots remain unchanged.

## Artifact boundary

- Baseline: Tintinweb 0.23.0 at
  `a60247c47f8b0a17bfe7208f9e248e464eda05f0`.
- Patch: reviewed commit `7a48987717c469f1f16202b9c8753a88bc862076`;
  compressed SHA-256
  `086508bb86003e6bbff8579e545200ce5626d290119f821613f7ca85c79be284`.
- Canonical preparation assets: `install/pi-runtime/tintinweb/`.
- Generated independent-package location: `docs/tintinweb/`.
- The patch is not an upstream release. Do-it does not publish or silently modify
  the third-party `@tintinweb/pi-subagents` package.

Before implementation, `node --test tests/pi/package.test.mjs` failed exactly
at the missing preparation assets and their tarball inclusion. After generation,
all **9/9** tests passed. The package test checks byte parity against canonical
assets and npm's actual file list, not just existence in the source directory.

## Reproduction from the candidate tarball

Packed `@tdwhere/do-it-pi@0.19.0` with `npm pack --ignore-scripts --json`, extracted
it to a new directory, and used **its bundled patch**, not the original runtime
worktree. Created a fresh tree from the pinned upstream baseline, applied the
patch after `git apply --check`, and ran:

```bash
npm ci --omit=dev --ignore-scripts --legacy-peer-deps
```

Only two production dependencies were installed; there were no upstream SDK/dev
dependencies in this prepared runtime. Its `src/` matched the reviewed patched
source byte for byte. This verifies the documented production-only preparation,
not merely a development checkout whose dependencies happen to work.

Then ran the committed native tests with both the **extracted plugin** and the
**newly prepared runtime**. The probe still takes the Pi 1.5.0 host SDK from the
development checkout, as a real installed host supplies SDK packages:

```bash
DO_IT_PI_PLUGIN_ROOT=/absolute/path/to/extracted/package \
DO_IT_TINTINWEB_SOURCE=/absolute/path/to/newly-prepared-runtime \
DO_IT_TINTINWEB_BASELINE=/absolute/path/to/unpatched-0.23.0 \
DO_IT_PI_EVIDENCE_DIR=/absolute/path/to/new-evidence \
node --test tests/pi/native-primary.test.mjs
```

Result: **14/14 passed, zero skips**. This includes persisted/in-memory/nested
children, filtered extensions, ordinary forks, concurrent cancellation, root
path authority, interruption/resume, saved-child role transitions, and bounded
negative controls. The unpatched baseline remains explicitly unsupported.
Actual file/Bash tools and shell hooks execute; model responses use a local fake
provider and network fetch is denied. These are runtime-contract checks, not
model-effectiveness measurements.

Candidate integrity (identifies this pre-publication artifact, not necessarily
the final registry tarball):
`sha512-QYWSBfqMIOCfaHTG7EYROksh9fGD4E8IlZggc6ajPm1I9T1kdpvGMP+5mCD7244jcuyTHtQ5R7zsCC4KfKyebw==`.
Local logs: `/tmp/do-it-pi-patch-red.log`, `/tmp/do-it-pi-patch-green.log`, and
`/tmp/do-it-pi-packaged-pair-native.log`. Original native JSON outputs and the
candidate tarball are preserved in the protected local upgrade evidence folder.
Final publication must record the actual registry integrities separately.
