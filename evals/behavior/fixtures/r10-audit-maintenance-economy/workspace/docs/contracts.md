# Package contracts

This original synthetic package has no known runtime defect. Invoice and batch
both total arrays of integer cents using the same rule: sum each amount once,
with an empty array totaling zero. Callers provide safe integer amounts, and
every intermediate running sum must remain a safe integer. Negative amounts
are supported credits.

External clients use the package root, `/batch`, and `/format` exports. The
formatter accepts safe integer cents, rejects other inputs, and returns exactly
two decimal places. Its wrapper owns that validation and conversion contract.
It need not have an internal production caller to be supported.

`generated/format.mjs` is shipped as an exact byte copy of `src/format.mjs`.
The consistency assertion in the public test checks that relationship; changes
to the canonical formatter must update the shipped copy together.

There is no plugin registry, dynamic import, directory scanning, command-line
entry point, or consumer of private files. Package exports are the complete
supported production entry points. The pipeline has no external extension
contract or planned alternate stage. Tests are consumers, not production roots.
