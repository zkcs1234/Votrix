# TODO — Close Image Deduplication Gaps

## Goal

The core SHA-256 dedup system exists. These steps close the remaining gaps so
image_asset_id is fully tracked for poll question/option images, the down
migration targets the correct table, and event deletion cleans up banners.

## Steps

- [ ] 1. Frontend PollingBuilderPage: track imageAssetId for question + option images
- [ ] 2. Backend polling validators: accept and pass through image_asset_id
- [ ] 3. Backend polling.service: persist image_asset_id for questions + options
- [ ] 4. Backend polling.service: cleanup old asset on question replace/delete
- [ ] 5. Backend polling.service: cleanup old option assets on option replace
- [ ] 6. Fix 037_down migration: contestants -> competition_contestants
- [ ] 7. Add event delete banner cleanup (event.service / controllers)
- [ ] 8. Verify wiring (search for image_asset_id usage, run linters/tests)
