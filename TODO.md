# Organization Refactoring - Implementation TODO

- [x] Analysis and plan created (REFACTOR_ORGANIZATION_PLAN.md)
- [x] **Phase 1:** Database migration SQL files (028_single_organization_per_organizer.sql + down)
- [x] **Phase 2:** Consolidate `organization.service.js` — single getOrCreateOrganization, removed orgType param from updateOrganizationLogo, backward-compat aliases
- [x] **Phase 3:** Update service dependencies — election.service.js, pageant.service.js, polling.service.js, event.service.js, admin.service.js all use single org model
- [x] **Phase 4:** Remove 3 duplicated logo endpoints (election, competition, polling controllers/routes), add 1 centralized (organizer.controller.js + organizer.routes.js)
- [x] **Phase 5:** Update `event.service.js` — removed logo from organizations query (logo now on users table)
- [x] **Phase 6:** Update `admin.service.js` for 1:1 org model — simplified summary, single org per organizer
- [x] **Phase 7:** Verify frontend event forms — all 3 event pages use banner upload (not org logo), no changes needed
- [x] **Phase 8:** Update frontend services — all 3 services (election, pageant, polling) point to `/organizer/organization/logo`
- [ ] **Phase 9:** Update documentation (BUSINESS_RULES.md, AI_CONTEXT.md)
- [ ] **Phase 10:** Frontend: Add Organization Settings page for logo upload (shared component)
- [ ] **Phase 11:** Frontend: Display org logo consistently (AppShell, HomePage, events)
- [ ] **Phase 12:** Cleanup: Run migration on prod DB, remove legacy code after transition
