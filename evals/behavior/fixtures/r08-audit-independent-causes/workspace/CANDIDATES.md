# Untrusted candidate findings

These are hypotheses, not accepted requirements or fixes.

- H1: provider subjects `User7` and `user7` have the same lookup identity.
- H2: distinct export runs for one customer in the same second overwrite the
  same archive entry. Perhaps every key should share an identity normalizer.
- H3: accepting eventId `E7` for both tenant `north` and tenant `south` violates
  a global uniqueness policy; dedup should use only eventId.
- H4: using accountId as the session marker identity must be a security bug
  because all session IDs need to be globally unique across devices forever.

A prior reviewer proposed one universal identity registry for all four.
That proposal has not been checked against the contracts.
