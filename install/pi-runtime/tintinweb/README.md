# Prepare the Tintinweb primary runtime

Do-it 0.19.0's in-process child routing requires the reviewed session-identity
patch. Published, unpatched `@tintinweb/pi-subagents` 0.23.0 does not provide it.
The runtime's package version stays 0.23.0 after applying the patch; version
alone is not proof. This is a local source preparation, not a third-party npm
release or an automatic modification of your current runtime.

The standalone `@tdwhere/do-it-pi` tarball includes this guide, the upstream MIT
license, and `session-identity.patch.gz` in `docs/tintinweb/`. A root do-it
checkout/npm package includes them in `install/pi-runtime/tintinweb/`.

## Prepare without changing the active installation

Use a new directory outside your current Pi package install. Review the patch
before applying it. Commands below need Git, gzip, npm, and registry/GitHub
access; they do not call a model provider.

```bash
# Set this to the directory containing this guide and the bundled patch.
PATCH_DIR=/absolute/path/to/do-it-pi/docs/tintinweb
sha256sum "$PATCH_DIR/session-identity.patch.gz"
# Expected SHA-256:
# 086508bb86003e6bbff8579e545200ce5626d290119f821613f7ca85c79be284

git clone https://github.com/tintinweb/pi-subagents.git pi-subagents-do-it
cd pi-subagents-do-it
git checkout --detach a60247c47f8b0a17bfe7208f9e248e464eda05f0
gzip -dc "$PATCH_DIR/session-identity.patch.gz" | git apply --check
gzip -dc "$PATCH_DIR/session-identity.patch.gz" | git apply
npm ci --omit=dev --ignore-scripts --legacy-peer-deps
```

The baseline is upstream 0.23.0. The patch is the portable form of reviewed
commit `7a48987717c469f1f16202b9c8753a88bc862076`. It adds creator-owned,
session-scoped `subagents:session-context` identity for root and child sessions;
it does not confer a permission sandbox. Pi supplies its SDK packages at load
time, so the production-only preparation intentionally does not install SDK
peers or upstream development dependencies.

## Activate the pair deliberately

Do not hot-swap a running parent whose already-loaded runtime can still create
children. Finish active children and close that Pi process first.

1. Back up Pi settings, the previous do-it package/source, and the runtime source.
   Preserve custom agents, runtime configuration, and session history.
2. In `~/.pi/agent/settings.json`, replace only the selected
   `npm:@tintinweb/pi-subagents` package source with the **absolute path** to the
   prepared checkout. Keep any existing package resource filters. Check trusted
   project settings for an overriding source too. Do not add a second copy.
3. Select do-it 0.19.0 as the paired plugin, then start a **fresh Pi process**.
   Local package paths load directly; no registry update of Tintinweb is implied.
4. `/do-it-status` must report a root identity, not `unmarked`. Inspect actual
   role sources: Tintinweb's package roles have bare names. Root identity and role
   discovery alone are not child-execution proof.

The repository's `tests/pi/native-primary.test.mjs` exercises real Pi 1.5.0
sessions and tools with a local fake provider. Set `DO_IT_TINTINWEB_SOURCE` to
this prepared directory to run it from a do-it development checkout. It covers
child execution, recovery, role transitions, and cancellation; it does not
measure model quality. No model call is required to prepare the patch.

Rollback is also paired: restore the previous runtime source **and** its
compatible do-it package, then restart. Restoring only the old runtime while
keeping this new adapter is not a valid rollback. Keep this local checkout until
an upstream release with the same verified capability can replace it; ordinary
package updates do not update a local source automatically.

## Alternatives

The extension/skills work without any subagent runtime. The separate nicobailon
`pi-subagents` **0.35.1** runtime has native compatibility evidence on Linux;
its roles use `do-it.*`. Do not load both runtimes expecting automatic selection.
Windows lifecycle and other runtime versions remain unverified. Required project
constraints must be delegated explicitly with Tintinweb, whose replacement
prompt does not automatically inherit those files.
