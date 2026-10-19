# Target schema difference — BLOCKED

No direct read-only target catalog, validated-constraint inventory, function/trigger definitions, RLS/ACL/role metadata or checksum migration ledger was supplied. Phase 9 made no Supabase requests. An exact deployed difference is **unavailable**, rather than inferred from prior REST surface observations.

Local `baseline.json` and `configuration-migrations.json` identify exact source hashes, declared functions/tables and explicit security search paths. `native-preflight-final.json` verifies the actual local 108 catalog/constraints/triggers/privileges; `chain-recovery.json` verifies local forward 103–108 and history preservation. These are expected-source/local-fixture evidence, not deployed state or permission to apply SQL.

The database owner must supply approved complete read-only target catalog and ledger evidence, all-module lossless historical inventories and reviewed 100–102 prerequisites. Compare validated keys/constraints/indexes, event/account/entry dependencies, exact function signatures/body hashes/owners/search paths, guard triggers, immutable tables, private-helper grants, RLS and applied checksums. Resolve every difference without backfilling locks into submissions or recomputing history.

Only then can the owner prepare a target-specific missing-forward-migration list in 103→104→105→106→107→108 order. Do not replay older files over later RPC guards, run a directory-wide migration loop or supply destructive down migrations. Any candidate or production SQL execution requires separate authorization and verified recovery evidence.
