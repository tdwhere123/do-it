# Cache routes

Write-through and cache-aside are both viable. Neither dominates.

- Write-through wins when a reader in this process must never see a stale
  value after a writer in this process. Every `set` updates backing and cache.
- Cache-aside wins when writes vastly outnumber reads and a short stale
  window is acceptable. `set` updates backing only; `get` fills the cache
  on miss.

Do not merge them into a score-average hybrid (cache-only writes, or
write-through with a stale window). Pick one complete route.
