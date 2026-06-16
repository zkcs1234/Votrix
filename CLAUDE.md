# Plan: Fix Notification Modal Mobile Display

## Problem
The notification modal looks bad on mobile screens:
- Modal positioning overflows on small screens
- Buttons stack poorly  
- Content is cramped
- Overall layout doesn't adapt well to narrow viewports

## Analysis of Current Code

### Issues Found in `NotificationsModal.jsx`:

1. **Modal positioning** (line 149):
   - `absolute right-0` - on small screens, this can overflow past the left edge
   - Need: centered modal on mobile

2. **Modal width** (line 149):
   - `w-[90vw]` - okay, but `w-[95vw] max-w-[400px]` would be better for mobile

3. **Notification card buttons** (line 45):
   - `flex-wrap gap-2` - buttons wrap but could look cleaner
   - Need: single row on mobile with smaller buttons

4. **Search/filter section** (lines 160-192):
   - Stack could be improved for mobile

## Implementation Steps

### Step 1: Fix Modal Positioning and Width
**File:** `frontend/src/components/ui/NotificationsModal.jsx`

Change the modal container from:
```jsx
// BEFORE
<div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[85vh] w-[90vw] sm:w-[500px] flex-col overflow-hidden rounded-2xl border border-v-border bg-v-bg shadow-2xl">
```

To:
```jsx
// AFTER - centered on mobile, right-aligned on larger screens
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:absolute sm:right-0 sm:top-[calc(100%+0.5rem)] sm:ml-auto sm:w-[90vw] md:w-[500px]">
  <div className="flex max-h-[85vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-v-border bg-v-bg shadow-2xl sm:max-h-[85vh]">
```

Note: The `fixed inset-0` with flex center creates a backdrop overlay on mobile, which is better UX anyway.

### Step 2: Fix Notification Card Buttons
**File:** `frontend/src/components/ui/NotificationsModal.jsx`

Change the action buttons section (around line 45):
```jsx
// BEFORE
<div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">

// AFTER - smaller buttons on mobile
<div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end sm:gap-2">
```

And update button styling:
```jsx
// Make "Open" button smaller on mobile
className="inline-flex items-center justify-center rounded-lg border border-v-border-strong bg-v-surface px-2 py-1 text-xs font-medium text-v-text transition hover:bg-v-surface-elevated sm:px-2.5"
```

### Step 3: Add Mobile Backdrop
The modal already has a backdrop (line 148):
```jsx
<div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
```

This is good - just ensure it works properly with the new layout.

## Summary of Changes

| Component | Mobile Fix |
|-----------|------------|
| Modal container | Center with backdrop on mobile, right-dropdown on desktop |
| Modal width | `max-w-[400px]` with full width on mobile |
| Buttons | Smaller, tighter spacing on mobile |
| Backdrop | Keep for better UX |

## Testing Checklist
- [ ] Modal centered on mobile (< 640px)
- [ ] Modal right-aligned on desktop (≥ 640px)
- [ ] Notification cards readable on mobile
- [ ] Buttons fit without overflow
- [ ] Search/filter section usable on mobile
- [ ] Close button accessible