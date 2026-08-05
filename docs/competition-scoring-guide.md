# Competition Scoring — Criteria Page & Workspace Guide

This document explains what each page and tab does, what you input, and how they connect to each other using a single real example throughout: **Miss University 2025**.

---

## The Big Picture

Before diving into each page, here is the order you should follow:

```
1. Criteria Page       → Define what judges will score
2. Workspace: Structure  → Group rounds into categories (optional)
3. Workspace: Rounds     → Create rounds, assign contestants & criteria per round
4. Workspace: Judge Assignments → Restrict which judges score which round
5. Workspace: Scoring Config    → Set the math formula for final scores
6. Live Control        → Run the competition in real time
7. Rankings            → See final results
```

---

## 1. Criteria Page

**Purpose:** Define the scoring items that judges will fill in for each contestant.

Think of this as building the **scoring sheet** that every judge sees.

### What you input

| Field | Example | Meaning |
|-------|---------|---------|
| Criteria name | `Beauty` | The label judges see on their scoring form |
| Weight % | `30` | How much this item counts toward the final score |
| Min score | `1` | Lowest value a judge can give |
| Max score | `10` | Highest value a judge can give |

### Miss University 2025 example

You create these 3 criteria:

```
Beauty           → 30%,  score range 1–10
Intelligence     → 40%,  score range 1–10
Stage Presence   → 30%,  score range 1–10

Total weight: 30 + 40 + 30 = 100% ✅
```

> ⚠️ The total weight must equal exactly 100% before you can open scoring.

### What this does NOT do

The Criteria page only creates the criteria pool. It does **not** assign criteria to rounds. That happens in the Workspace Rounds tab.

---

## 2. Workspace — Structure Tab (Categories)

**Purpose:** Create phases or groupings for your competition. Categories are optional but useful when your competition has distinct phases that each carry a different weight toward the final score.

### What you input

| Field | Example | Meaning |
|-------|---------|---------|
| Category name | `Preliminary Phase` | The name of this phase |
| Weight % | `40` | How much this phase counts toward the final score |

### Miss University 2025 example

```
Preliminary Phase  → 40%
Finals Phase       → 60%

Total weight: 40 + 60 = 100% ✅
```

This means the Preliminary counts 40% of a contestant's overall score, and the Finals counts 60%.

### When to skip this tab

If your competition has no phases — just one straight competition with all rounds carrying equal importance — you can skip categories entirely. Rounds can exist without belonging to any category.

---

## 3. Workspace — Rounds Tab

**Purpose:** Create the actual competition stages and assign which contestants and criteria belong to each round.

This is where the Criteria page connects to the structure.

### What you input (to create a round)

| Field | Example | Meaning |
|-------|---------|---------|
| Round name | `Preliminary Round` | The name shown in Live Control |
| Weight % | `40` | How much this round contributes to the final score |
| Category (optional) | `Preliminary Phase` | Which category/phase this round belongs to |

### Miss University 2025 example

```
Preliminary Round
  → Weight: 40%
  → Category: Preliminary Phase

Finals Round
  → Weight: 60%
  → Category: Finals Phase

Total round weight: 40 + 60 = 100% ✅
```

### Assigning contestants and criteria to a round

After creating a round, click **"Assign contestants & criteria"** on that round row. A panel expands showing two columns:

**Left column — Contestants**

Lists all contestants from your event. Click **Add** to include a contestant in this round. Click **Remove** to take them out.

```
Preliminary Round contestants:
  ✅ #1 Maria Santos    → Add (she competes in Preliminary)
  ✅ #2 Ana Reyes       → Add
  ✅ #3 Jane Cruz       → Add
  ✅ #4 Lea Gomez       → Add
  ✅ #5 Rosa Dela Cruz  → Add
```

```
Finals Round contestants:
  ✅ #1 Maria Santos    → Add  (top 3 advance)
  ✅ #2 Ana Reyes       → Add
  ✅ #3 Jane Cruz       → Add
  ❌ #4 Lea Gomez       → NOT added (eliminated)
  ❌ #5 Rosa Dela Cruz  → NOT added (eliminated)
```

**Right column — Criteria**

Lists all criteria you created on the Criteria page. Click **Add** to use a criteria in this round. Click **Remove** to exclude it.

```
Preliminary Round criteria:
  ✅ Beauty 30%         → Add  (used in preliminary)
  ❌ Intelligence 40%   → NOT added (not judged yet)
  ✅ Stage Presence 30% → Add  (used in preliminary)
```

```
Finals Round criteria:
  ✅ Beauty 30%         → Add
  ✅ Intelligence 40%   → Add  (now included in finals)
  ✅ Stage Presence 30% → Add
```

### What the Open/Closed toggle does

- **Open** — judges assigned to this round can submit scores
- **Closed** — scoring is locked for this round; judges cannot score even if the session is active

### How this connects to Live Control

When the organizer switches to **Preliminary Round** during the live session, judges only see **Beauty** and **Stage Presence** on their scoring form — Intelligence does not appear yet.

When the organizer switches to **Finals Round**, all 3 criteria appear.

---

## 4. Workspace — Judge Assignments Tab

**Purpose:** Control which judges score which round or category. By default, all judges score everything. This tab lets you restrict them.

> ℹ️ To register or invite judges, go to the **Judges page** in the sidebar. This tab only manages assignments for judges who are already registered.

### What you input

For each judge, you choose a scope and a target:

| Scope | What it means |
|-------|---------------|
| Event | Judge scores all rounds (default) |
| Category | Judge only scores rounds inside this category |
| Round | Judge only scores this specific round |

### Miss University 2025 example

You have 3 judges registered on the Judges page:

```
Judge Maria   → Assign to: Preliminary Round only
                (she scores Beauty & Stage Presence in Preliminary)

Judge Jose    → Assign to: Finals Round only
                (he scores all 3 criteria in Finals)

Judge Ana     → No assignment = Event-wide
                (she scores both rounds, all criteria)
```

### What happens without assignments

If you never set any assignments, all judges score all rounds. Assignments are only needed when you want to split judging duties between rounds or categories.

---

## 5. Workspace — Scoring Config Tab

**Purpose:** Define how the numbers are calculated after all judges submit their scores. This has nothing to do with creating criteria or rounds — it controls the math.

### What you input

| Field | Example | Meaning |
|-------|---------|---------|
| Score type | `1–10` | The range judges score within |
| Calculation method | `Weighted average` | How judge scores are combined |
| Decimal places | `2` | How many decimals in the final score (e.g. `8.75`) |
| Custom min/max | `0 / 100` | Only used if score type is set to Custom range |
| Drop highest N | `0` | Ignore the N highest judge scores per contestant |
| Drop lowest N | `1` | Ignore the N lowest judge scores per contestant |

### Miss University 2025 example

```
Score type         → 1–10
Calculation method → Weighted average
Decimal places     → 2
Drop lowest N      → 1
```

With 3 judges scoring contestant Maria for Beauty:
- Judge Maria gives: `8`
- Judge Ana gives:   `9`
- Judge Jose gives:  `4`  ← this is the lowest, gets dropped

Final Beauty score for Maria = average of `8` and `9` = **8.50**

That score is then multiplied by Beauty's weight (30%) to contribute to the final ranking.

### Calculation methods explained

| Method | What it does |
|--------|-------------|
| Average | Simple average of all judge scores |
| Weighted average | Average weighted by each criteria's percentage |
| Sum | Adds all judge scores together |
| Highest score | Takes only the highest judge score |
| Lowest-score removal | Drops the lowest score before averaging |

---

## How Everything Connects

```
Criteria Page
  └─ Creates: Beauty 30%, Intelligence 40%, Stage Presence 30%
                            │
                            ▼
Workspace: Structure
  └─ Creates: Preliminary Phase (40%), Finals Phase (60%)
                            │
                            ▼
Workspace: Rounds
  └─ Preliminary Round (40%) → uses Beauty + Stage Presence
                              → includes contestants #1–#5
  └─ Finals Round (60%)      → uses all 3 criteria
                              → includes only contestants #1–#3
                            │
                            ▼
Workspace: Judge Assignments
  └─ Judge Maria → Preliminary Round only
  └─ Judge Jose  → Finals Round only
  └─ Judge Ana   → Event-wide (all rounds)
                            │
                            ▼
Workspace: Scoring Config
  └─ Weighted average, drop lowest 1 judge, 2 decimal places
                            │
                            ▼
Live Control
  └─ Organizer starts session
  └─ Switches to Preliminary → Judges see Beauty + Stage Presence
  └─ Switches to Finals      → Judges see all 3 criteria
  └─ Navigates contestants with Prev/Next
  └─ Ends session → scores locked
                            │
                            ▼
Rankings Page
  └─ Final weighted scores calculated using Scoring Config
  └─ Updates in real time via WebSocket
```

---

## Quick Reference

| Page / Tab | What you do there |
|------------|------------------|
| Criteria page | Create scoring items with weight % and score range |
| Workspace: Structure | Create phases/categories that group rounds |
| Workspace: Rounds | Create rounds, set their weight, assign contestants and criteria |
| Workspace: Judge Assignments | Restrict which judges score which round or category |
| Workspace: Scoring Config | Set calculation method, decimal places, drop rules |
| Judges page (sidebar) | Register judges, send invitation emails |
| Contestants page (sidebar) | Add contestants with name, number, and photo |
| Live Control | Run the competition — switch rounds, navigate contestants |
| Rankings | View live and final scores |
