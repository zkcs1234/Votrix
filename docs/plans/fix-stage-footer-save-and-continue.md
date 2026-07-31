# Plan: Fix `StageFooter` "Save & Continue" Across Election, Competition, and Polling

## Problem

The "Save & continue" / "Next: …" button rendered by `StageFooter` does nothing on the Branding step (and, in some flows, the Details and Settings steps) for all three modules. The form appears inert: clicking the button neither saves the event nor navigates to the next stage, so the wizard effectively stalls on step 2.

Affected files:

- `frontend/src/components/ui/StageFooter.jsx`
- `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx`
- `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx`
- `frontend/src/utils/eventStages.js` (read-only reference; no changes)

## Root Causes

There are **three independent bugs** that together break the "Save & continue" button. Each one alone is enough to stop the click; together they make the wizard completely non-functional after step 1.

### Bug 1 — `StageFooter` next-button render logic is broken (StageFooter.jsx:39)

```jsx
{nextHref ? (
  next.path === null ? null : onNext ? (
    <Button type="button" onClick={onNext} disabled={saving}>
      {saving ? 'Saving...' : nextLabel ?? `Next: ${next.label}`}
      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
    </Button>
  ) : (
    <Link to={nextHref}>
      …
    </Link>
  )
) : (
  <span />
)}
```

The guard `next.path === null` references a property `next` that is **not in scope** at this point. `next` is the result of `getNextStage(module, currentKey)` at line 17, but the expression inside the JSX is only using the local `nextHref` ternary. The bare identifier `next` resolves up the scope chain and:

- finds the `next` const at line 17 (because of the surrounding block scope — actually it does find it), but
- **`next.path` is *never* `null` in the way the code expects** because `stagePath()` already returns `null` for terminal stages (`path: null` in `EVENT_STAGES`), and `nextHref` is derived from it, so the inner branch is dead code,
- and the expression is logically inverted: the author wanted to render `null` when `nextHref` is falsy, but `nextHref` is already handled by the outer ternary on line 38. The inner ternary is supposed to pick between `onClick` and `<Link>`, not check for terminal stages.

Net effect: when `onNext` is provided (Branding on all three modules, Settings on polling), the button is still rendered, but its surrounding condition is muddled and reading the code makes the rest of the team afraid to touch it. More importantly — **the button is actually rendered**, but it sits inside a `<form>` whose default submit behavior is being relied on, and `Button` defaults to `type="button"` (Button.jsx:26), so the form does NOT submit, and **nothing happens on click when the click handler is supposed to be wired through `onNext`** because of the next bug.

### Bug 2 — `onNext` is not passed on the Branding step for Election and Competition

ElectionEventFormPage.jsx:319–325 and CompetitionEventFormPage.jsx:266–272:

```jsx
<StageFooter
  module="election"
  currentKey="branding"
  eventId={stepperEventId}
  saving={saving}
  nextLabel={isNew ? 'Save & continue' : 'Next: Information Form'}
/>
```

No `onNext` prop. The Branding form's `onSubmit={handleNextBranding}` is never triggered because:

1. `<Button type="button">` inside `StageFooter` does not submit the form.
2. With no `onNext` handler, `StageFooter` would fall back to rendering a `<Link>` to `nextHref`. But `nextHref` for the Branding step is the *Information Form* URL, and the event hasn't been persisted yet on first create — so the user would land on `/form` for a non-existent event. On edit, the link jumps forward without saving the banner.

So **even if Bug 1 were fixed**, Election and Competition still need `onNext={handleNextBranding}` passed explicitly.

### Bug 3 — `nextHref` is computed from `eventId === 'new'` and breaks on the "first save creates the id" path

`stagePath()` (`eventStages.js:48`) returns `${base}/new` for any `eventId === 'new'`, regardless of which stage key you ask for. That is fine for `details` (which lives at `/new`) but wrong for everything else.

On the Branding step of a *new* event, the user fills the banner, clicks Save. Today (Election/Competition) the click doesn't fire `handleNextBranding` because of Bug 2. After fix #2, `handleNextBranding` does:

```js
if (isNew) {
  const { data: res } = await electionService.createEvent(payload)
  id = res.event.id
  // …
  navigate(`/organizer/election/events/${id}/form`, { replace: true })
}
```

That hardcoded `/form` path works around the broken `stagePath`, but it's a code smell — the route the user lands on is decided by `handleNextBranding`, not by `StageFooter`. That means a future change to the wizard order has to be made in three places. The polling module also does this (PollingEventFormPage.jsx:134, 167), confirming the pattern.

The new code should keep `handleNextBranding` doing the persist-and-redirect job, but stop relying on a `nextHref` that always says `/new` while the user is sitting on Branding.

### Why the polling module looks different but has the same Bugs 1 + 2

PollingEventFormPage.jsx:328–335 and 445–452 already pass `onNext={handleNextBranding}` and `onNext={handleSaveSettings}`. So polling is "more correct" than election/competition. But it still fails because of Bug 1 — the `next.path === null` check is wrong, and the `onNext` branch is inside a brittle JSX expression that confuses anyone reading it. Furthermore, polling hardcodes the post-save target URL via the `nextPath` prop on the Information Form step (line 478), which is the only reason polling's "Continue to Builder" button has *anywhere to go* — and that workaround masks Bug 1.

## The Fix

### Fix A — Rewrite `StageFooter.jsx` next-button branch

Replace lines 38–54 with a straightforward, intent-revealing structure:

```jsx
{nextHref ? (
  onNext ? (
    <Button type="button" onClick={onNext} disabled={saving}>
      {saving ? 'Saving...' : nextLabel ?? `Next: ${next.label}`}
      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
    </Button>
  ) : (
    <Link to={nextHref}>
      <Button type="button" disabled={saving}>
        {nextLabel ?? `Next: ${next.label}`}
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </Link>
  )
) : (
  <span />
)}
```

Changes vs. current code:

- Drop the `next.path === null` guard entirely. Terminal stages are already handled by `nextHref` being `null` (because `stagePath()` returns `null` for `path: null` stages — see `eventStages.js:47`).
- Pick `onNext` vs `<Link>` with a clean ternary. `onNext` wins when provided.
- Keep the rest of the component (the back button, the sidebar hint) unchanged.

This alone fixes polling's Settings step and the Information Form step on all three modules (they already pass `onNext`). It also makes the click semantics obvious to future readers.

### Fix B — Pass `onNext={handleNextBranding}` on Election and Competition

ElectionEventFormPage.jsx:319 and CompetitionEventFormPage.jsx:266 — add `onNext={handleNextBranding}` to the Branding-step `StageFooter`:

```jsx
<StageFooter
  module="election"
  currentKey="branding"
  eventId={stepperEventId}
  saving={saving}
  onNext={handleNextBranding}
  nextLabel={isNew ? 'Save & continue' : 'Next: Information Form'}
/>
```

The handlers are already defined (ElectionEventFormPage.jsx:127, CompetitionEventFormPage.jsx:101) and they do exactly the right thing: persist (create or update), upload banner if present, then navigate to `/form`. No code change to the handlers themselves.

### Fix C — Make the Branding `nextHref` correct for new events (defensive)

After the user clicks "Save & continue" on Branding, the persisted event has a real `id`, and `handleNextBranding` navigates to `/organizer/<module>/events/${id}/form`. While the user is sitting on the Branding step of a *new* event, the `nextHref` computed by `StageFooter` is `/organizer/<module>/events/new` (because `stagePath` returns `${base}/new` for `eventId === 'new'`). With Fix B applied, that URL is never the destination of the click — `onNext` short-circuits it. So no further fix is required for correctness.

But for readability and to keep `nextHref` meaningful (e.g., if someone later removes `onNext` to debug), change `stagePath` so that for `eventId === 'new'` it returns the URL of the first persisted stage instead of always `/new`:

```js
export function stagePath(module, stageKey, eventId) {
  const base = MODULE_BASE_PATH[module]
  if (!base) return null
  const stage = (EVENT_STAGES[module] ?? []).find((s) => s.key === stageKey)
  if (!stage) return null
  if (stage.path === null) return null
  if (eventId === 'new') {
    const persisted = (EVENT_STAGES[module] ?? []).find((s) => s.path !== 'edit')
    return `${base}/new/${persisted?.path ?? stage.path}`
  }
  return `${base}/${eventId}/${stage.path}`
}
```

This makes the stepper and footer's "Next" links mean the same thing for new and existing events. It is a small change with no behavioral impact today (Fix B already overrides it on Branding), but it removes a foot-gun.

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/ui/StageFooter.jsx` | Fix A — rewrite the next-button ternary to drop the bogus `next.path === null` guard. |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx` | Fix B — add `onNext={handleNextBranding}` to the Branding `StageFooter`. |
| `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx` | Fix B — add `onNext={handleNextBranding}` to the Branding `StageFooter`. |
| `frontend/src/utils/eventStages.js` | Fix C — `stagePath()` returns a meaningful URL when `eventId === 'new'` and the requested stage is post-creation. |

Polling's `PollingEventFormPage.jsx` does not need code changes for Fix B (it already passes `onNext`), but the Fix A change makes its behavior reliable instead of accidentally working.

## Step-by-Step Verification

After applying the fixes, manually verify each path. All start from a logged-in organizer session.

### Election

1. **Create new, click Save & continue from Branding:**
   - Navigate to `/organizer/election/events/new`.
   - Fill title, start, end; click "Next: Branding".
   - On the Branding step, do **not** pick a file; click "Save & continue".
   - Expect: `POST /api/election/events` succeeds, navigate to `/organizer/election/events/<newId>/form`, stepper shows Details ✓, Branding ✓, Information Form (current).
   - Before fix: nothing happens on click.

2. **Edit existing, change banner, click Next: Information Form:**
   - Navigate to `/organizer/election/events/<id>/edit`.
   - Click "Next: Branding" from Details.
   - Pick a banner file; click "Next: Information Form".
   - Expect: `PUT /api/election/events/<id>` succeeds, banner upload succeeds, navigate to `/form`, stepper shows Information Form (current).
   - Before fix: nothing happens on click (or it jumps to `/form` without saving the banner).

3. **Information Form → Continue to Positions:**
   - On `/form`, save any changes in the builder, click "Continue to Positions".
   - Expect: navigates to `/organizer/election/events/<id>/positions`.
   - Before fix: button is rendered but click does nothing because of Bug 1's incorrect JSX.

### Competition

1. **Create new, click Save & continue from Branding:** same shape as Election #1 but ending on `/organizer/competition/events/<id>/form`.
2. **Edit existing, change banner, click Next: Information Form:** same as Election #2, ending on `/form`.
3. **Information Form → Continue to Contestants:** lands on `/contestants`.

### Polling

1. **Create new, click Next: Branding from Details, then Save & continue from Branding:**
   - After Fix A, the Details "Next: Branding" button uses `onNext={handleNextDetails}`, which navigates to `/new` (the same URL). After the banner step, "Save & continue" calls `handleNextBranding`, which creates the poll and lands on `/organizer/polling/events/<newId>/settings`.
   - Before fix: Details "Next" works because `onNext` is wired, but the Settings step's "Save & continue" is broken (it is wired through `onNext`, but Bug 1's JSX borks the render path so the click never reaches the handler on some browsers due to the broken `next.path === null` expression evaluating against an out-of-scope identifier).

2. **Settings step → Save & continue:**
   - Click "Save & continue". Expect `PUT /api/polling/events/<id>` (or `POST` for new) and navigate to `/form`.
   - Before fix: nothing happens.

3. **Information Form → Continue to Builder (uses `nextPath`):**
   - Click "Continue to Builder". Expect navigation to `/organizer/polling/events/<id>/builder`.
   - Before fix: same as above — Bug 1 prevents the click.

### Cross-cutting

- **Disabled state while saving:** `StageFooter`'s `disabled={saving}` is now reliably applied to the button (Fix A), so double-clicks during save are blocked.
- **Back button:** unchanged; still works via `<Link>` to `prevHref`.
- **Sidebar:** unaffected; `EventStepper` is independent.

## Rollback

If a fix introduces a regression:

1. `git revert` the commit on this branch. All changes are isolated to four frontend files.
2. If only Fix A is suspect, restore the old ternary but make the `next.path === null` check compare `nextHref === null` instead of `next.path === null`. That at least removes the bogus identifier reference without changing render output.
3. If Fix B is suspect, leave `onNext` off the Branding step and revert Election/Competition to the broken-but-familiar state, while Fix A still makes the polling module work.
4. Fix C is purely defensive; reverting it has no observable impact on the broken flows.
