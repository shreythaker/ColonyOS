# ColonyOS — Technical Manual

**Version:** 3.0.1  
**Audience:** Lab manager / colony editor  
**App URL:** https://shreythaker.github.io/ColonyOS/

> To export this as a Word document: open this file in VS Code, right-click → *Open Preview*, then copy-paste into Word. Or use Pandoc: `pandoc technical-manual.md -o technical-manual.docx`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Header & Navigation](#2-header--navigation)
3. [Dashboard](#3-dashboard)
4. [Colony](#4-colony)
5. [Breeding](#5-breeding)
6. [Lineage](#6-lineage)
7. [Experiments](#7-experiments)
8. [Planner](#8-planner)
9. [Costs](#9-costs)
10. [Settings](#10-settings)
11. [Biology Rules Reference](#11-biology-rules-reference)
12. [Status Definitions](#12-status-definitions)
13. [GitHub Sync Workflow](#13-github-sync-workflow)
14. [Excel Import / Export](#14-excel-import--export)

---

## 1. Overview

ColonyOS is a browser-based mouse colony management app for the Montrose Lab. It runs entirely in the browser with no backend server — data is persisted locally via **localStorage** and synced to a JSON file in the GitHub repository for cross-device access.

**Key design principles:**
- The cage (identified by its DLAR cage card number) is the unit of tracking — individual mice are not tagged
- All state changes are logged in a full audit trail
- Strain AB (Apcfl/fl × Cdx2Cre) mice have a disease phenotype window of **4–10 weeks of age**
- Parent strains (A and B) must be maintained at or above configurable minimum thresholds at all times

---

## 2. Header & Navigation

### Status Indicator (top-left)
Shows the current sync state next to the version badge:

| Indicator | Meaning |
|---|---|
| ● GitHub synced | Data matches the last GitHub push |
| ● Unsaved changes | Local changes have not been pushed to GitHub |
| ● Saving… | GitHub push in progress |
| ● Loading… | Fetching from GitHub |
| ● Sync error | Last GitHub operation failed (hover/check Settings for message) |
| ● Saved (no PAT) | Saved to browser localStorage only |

### Push to GitHub Button (top-right)
Appears only when a Personal Access Token (PAT) is configured in Settings. Turns amber and shows **↑ Push to GitHub** when there are unsaved local changes. After a successful push it shows **✓ Saved** in green.

### Status Bar (below navigation)
Displays a live summary: today's date, per-strain mouse counts (active cages only), number of active crosses, and audit log entry count.

---

## 3. Dashboard

The Dashboard is the home screen. It provides a colony-wide snapshot and surfaces actionable alerts.

### Stat Cards
| Card | What it shows |
|---|---|
| Total Mice | Sum of all mice in non-retired, non-euthanized cages |
| Est. Monthly | Active cage count × $30 (i.e., $1/cage/day) |
| AB In Window | Total AB mice currently aged 4–10 weeks |
| Active Litters | Count of litters with status gestating or born (deleted litters excluded) |

### Active Alerts
Alerts are sorted by urgency (soonest first). Three alert types are generated automatically:

**Weaning alerts** — fires for any non-deleted litter whose wean date is within the configured alert window (default: 7 days). Shows litter ID, strain, wean date, and days remaining.

**Age-out alerts** — fires for every active (non-retired, non-deleted) cage:
- **Danger** (red): cage is at or past the age-out threshold (default: 35 weeks)
- **Soon** (amber): cage is within 3 weeks of the threshold

**Low colony alerts** — fires if the number of non-retired, non-deleted cages of any strain/sex drops below the configured minimum (default: 2 males and 2 females per parent strain). Counts all living statuses (active, mating, pregnant, weaning) — not just "active" cages.

### Upcoming Events
Lists all non-deleted litters that are not yet weaned, sorted by date. Shows:
- **Born litters** → wean date and days until weaning
- **Gestating litters** → expected birth date and days until birth

Dates within 3 days are highlighted red.

### Colony Overview Table
Per-strain breakdown showing number of male cages, female cages, and active mating pairs. Each row links to the underlying cage counts.

### Recent Activity
Last 10 audit log entries. Each entry shows timestamp, action type, and description.

---

## 4. Colony

The Colony tab is the primary cage management interface. Cages are grouped into collapsible sub-tables by status. The **Euthanized** group is collapsed by default; all others are expanded.

### Columns

| Column | Description |
|---|---|
| DLAR ID | Physical cage card number from DLAR (bold) |
| Colony ID | Internal sequential ID (e.g., C001), in gray |
| Strain | Apcfl/fl, Cdx2Cre, or Apcfl/fl/Cdx2Cre |
| Sex | M or F |
| Count | Number of mice in the cage |
| DOB | Date of birth |
| Age | Weeks old (calculated live) |
| Status | Color-coded badge (see Status Definitions) |
| Bred | Whether this cage has produced a litter (✓ = proven breeder) |
| Parent Litter | Litter ID this cage originated from (lineage tracking) |
| Exp. | Experiment ID if enrolled in a cohort |
| Notes | Free-text notes |
| Actions | Edit, Split, Merge, Retire/Unretire, Delete |

### Adding a Cage
Click **+ Add Cage**. Required fields: Colony ID (auto-suggested but editable), DLAR ID, strain, sex, mouse count, and date of birth. Optional: parent litter ID (for lineage), experiment ID, and notes.

### Editing a Cage
Click the pencil icon. All fields are editable. Every changed field is recorded in the audit log with old and new values.

### Splitting a Cage
Use when one or more mice need to be moved out of a cage (e.g., a pregnant female being separated from a harem). Enter the number of mice moving out — they receive a new auto-generated Colony ID. The original cage count is reduced by that number.

### Merging Cages
Female-only operation (males cannot be re-housed due to aggression). Select a source cage and a target cage — both must be female and the same strain. The source cage is retired and its mice are added to the target cage. Both cages must have a combined count of ≤ 4 mice.

### Retiring / Euthanizing
The **Retire** action sets a cage to `euthanized` and sets mouse count to 0. This is reversible via the **Unretire** action (restores to `active` with a minimum count of 1).

### Deleting a Cage
Soft-delete: the cage is hidden from all views but retained in data for audit purposes. A deletion reason is required. Deleted cages can be restored from the **Deleted Cages** sub-table.

### Batch Actions
Select multiple cages using the checkboxes (or **Select All**). Available batch actions: Retire all selected, Unretire all selected, Delete all selected.

### Audit Log Sub-tab
Full timestamped log of all colony operations. Can be archived (moves old entries to the archived log) or cleared entirely. Archived logs are accessible via the **Archived** sub-tab.

### Breeding Refresh
The **Refresh Breeding Status** button scans all cages and automatically updates weaning-age pup cages to `weaning` status when their litter's wean date has passed.

---

## 5. Breeding

The Breeding tab manages mating pairs/harems and litter tracking.

### Mating Pairs Sub-tab

#### Setting Up a Pair
Click **+ New Pair/Harem**. Configure:
- **Type:** Pair (1F + 1M) or Harem (up to 3F + 1M)
- **Strain:** must match across all cages in the pairing
- **Male cage** and **female cage(s)**
- **Setup date**

**Harem requirement:** the male cage must have `hasBreed = true` (proven breeder). The app warns if this is not met.

**Sibling check:** if any two cages share the same parent litter ID, a warning is shown. The relatedness coefficient is also calculated and displayed — pairings with r ≥ 0.10 generate a warning.

On creation, all female cages are automatically set to `mating` status; the male cage remains unchanged.

#### Pair Status Workflow
Update pair status using the status dropdown. Status changes automatically update cage statuses:

| Pair status → | Male cage | Female cage(s) |
|---|---|---|
| → Pregnant | mating → active | mating → pregnant |
| → Birthed | mating → active | pregnant → weaning |
| → Retired | — | weaning → active |

#### Harem Split
When one female in a harem becomes pregnant and needs to be separated:
1. Use **Split Pregnant Female** on the harem entry
2. A new cage is created for the pregnant female and a new mating pair record is created with status `pregnant`
3. The new pair retains the original harem's setup date
4. If only one female remains in the original harem, it is automatically downgraded from harem to pair

#### Editing a Pair
Click the pencil icon. Changes to cage assignments, setup date, or notes are permitted. All changes are logged.

### Litters Sub-tab

#### Adding a Litter
Click **+ Add Litter**. Fields:
- Mating pair (links the litter to a pair automatically)
- Strain, mother cage, father cage
- Status: gestating, born, or weaned
- Expected birth date (required for gestating)
- Birth date, wean date, pup counts (required for born/weaned)
- Notes

Wean date is auto-calculated as birth date + 21 days when a birth date is entered.

#### Updating a Litter
Click the pencil icon on any litter row. When birth date is entered for a gestating litter, wean date is auto-populated. Changes update the parent pair's `hasBreed` flag on the mother and father cages.

#### Deleting a Litter
Soft-delete with a required reason. Deleted litters are hidden from the Dashboard, Upcoming Events, and all alert calculations. They can be restored.

---

## 6. Lineage

The Lineage tab provides two tools for tracking heredity.

### Family Tree
Select any cage from the dropdown. The app renders an SVG family tree showing:
- The selected cage as the root
- Its parent litter and the mother/father cages
- Up to 3 generations of ancestry
- Strain-colored nodes and relationship labels

### Relatedness Checker
Select any two cages. The app computes the relatedness coefficient (r) via a recursive ancestor walk:

| r value | Label |
|---|---|
| 1.0 | Same cage |
| 0.5 | Parent–offspring |
| ≥ 0.48 | Full siblings |
| ≥ 0.23 | Half-siblings or closer |
| ≥ 0.10 | Related (cousins or closer) |
| > 0 | Distantly related |
| 0 | Unrelated |

Pairings with r ≥ 0.10 should be avoided.

---

## 7. Experiments

The Experiments tab tracks cohorts of AB mice for disease onset studies.

### Creating an Experiment
Click **+ New Experiment**. Fields: name, description, target N (number of AB mice needed), start date, and notes. Status defaults to `planned`.

### Enrolling Cages
Click **Enroll Cages** on any active experiment. A multi-select list shows all AB cages not already enrolled elsewhere. Selected cages are linked to the experiment and their `experimentId` field is set.

### Completing an Experiment
Click **Complete** to set status to `completed` and record the end date as today.

### Experiment Status
| Status | Meaning |
|---|---|
| Planned | Not yet started |
| Active | In progress; cages enrolled |
| Completed | End date recorded |

---

## 8. Planner

The Planner calculates how many mating pairs are needed and generates a week-by-week timeline to hit a target sample size of AB mice.

### Inputs
- **Target N:** number of AB mice needed in the phenotype window (4–10 weeks)
- **Target date:** when the mice must be in window
- **Notes:** optional

### Output
The planner generates a text report covering:

**If enough parent stock exists for immediate AB crosses:**
- Recommended specific cage pairings (A female × B male, or A male × B female)
- Tip on using harems if multiple litters are needed
- Week-by-week timeline from setup to phenotype window
- Cost estimate for breeding and offspring cages
- Risk flags (aging breeders, feasibility check)

**If parent stock is insufficient (two-phase plan):**
- Phase 1: breed parent strains to generate enough A and B animals
- Phase 2: AB cross once offspring are weaned and of age
- Full timeline spanning both phases

### Biology assumptions used by the planner
- Time to conception: ~1.5 weeks
- Gestation: ~3 weeks
- Total birth lag from pairing: ~4.5 weeks
- Weaning: 3 weeks after birth
- AB phenotype window: 4–10 weeks post-wean
- Litter size: 7 pups average, ~3 usable per sex
- Maximum breeder age for Phase 2 eligibility: 28 weeks

---

## 9. Costs

The Costs tab provides a monthly housing cost breakdown at $1/cage/day.

### Summary Cards
- Total cost to date (sum of all active cage-days since their activation date)
- Current monthly run rate
- Average cost per mouse

### Per-Cage Breakdown
Table listing every active cage with its activation date, days housed, and cost to date. Sorted by cost descending.

### Cost Minimization
Flags singly-housed cages where consolidation might reduce cage-days without violating the 4-mice-per-cage limit.

---

## 10. Settings

### General — Email Notifications
Enter a notification email address and toggle which alert types to send (weaning, age-out, low colony, monthly cost digest). Note: email delivery requires a backend integration; this UI only configures the triggers.

**Upcoming Weanings preview:** shows any litters wean-due within the alert window as a preview of what would be emailed.

### General — Alert Thresholds
| Setting | Default | Effect |
|---|---|---|
| Wean alert days | 7 | Days before wean date to show alert |
| Age-out threshold | 35 weeks | Age at which retirement alert fires |
| Min. males per strain | 2 | Triggers low colony alert if breached |
| Min. females per strain | 2 | Triggers low colony alert if breached |

### General — GitHub Sync
Configure the Personal Access Token (PAT) for pushing data to GitHub.

1. Generate a PAT at github.com → Settings → Developer Settings → Fine-grained tokens
2. Required permission: **Contents: Read and Write** on the `shreythaker/ColonyOS` repository
3. Paste the PAT into the field and click **Save PAT**
4. Use **Test Connection** to verify
5. Use **Pull from GitHub** to manually fetch the latest data
6. The **↑ Push to GitHub** button in the header saves all data to `data/colony.json` in the repo

PAT is stored only in your browser's localStorage — it never leaves your machine and is never embedded in the code.

### Advanced — Data Management
Access requires entering a password (set in source code). Options:
- **Export Excel:** downloads a `.xlsx` file with three sheets (Cages, Litters, Mating Pairs)
- **Import Excel:** restores data from a previously exported `.xlsx` backup. **Overwrites all current data.** The app is automatically marked as having unsaved GitHub changes after import.
- **Hard Reset:** exports a backup then wipes all data and restores defaults. Irreversible without the backup.

---

## 11. Biology Rules Reference

| Rule | Value |
|---|---|
| Weaning age | 3 weeks post-birth |
| Female fertility window | 8–36 weeks |
| Female age-out threshold | 35+ weeks (configurable) |
| Male age-out threshold | 35+ weeks (configurable) |
| Pair: male + female ratio | 1M + 1F |
| Harem: male + female ratio | 1M + up to 3F |
| Harem requirement | Male must be a proven breeder (hasBreed = true) |
| Re-housing rule | Males cannot be re-housed after separation. Females can be re-housed but receive a new cage card. |
| Litter size (typical) | 6–8 pups, slightly more females |
| Time to pregnancy | 1–2 weeks after pairing |
| Gestation | ~3 weeks |
| AB disease phenotype window | 4–10 weeks of age |
| Max mice per cage | 4 |
| Housing cost | $1/cage/day |
| Sibling mating | Avoid — app warns if parent litter IDs match |
| Relatedness threshold for warning | r ≥ 0.10 |

---

## 12. Status Definitions

### Cage Statuses
| Status | Color | Meaning |
|---|---|---|
| Active | Green | Normal housing, not in a mating pair |
| Mating | Yellow | Paired with a mate; awaiting pregnancy confirmation |
| Pregnant | Pink | Pregnancy confirmed |
| Weaning | Purple | Pups present, approaching wean date |
| Retired | Gray | Removed from breeding colony |
| Euthanized | Red | Mouse count set to 0; cage closed |

### Mating Pair Statuses
| Status | Meaning |
|---|---|
| Waiting | Pair set up; checking for pregnancy |
| Pregnant | Pregnancy confirmed |
| Birthed | Litter born; wean date set |
| Retired | Pair dissolved |

### Litter Statuses
| Status | Meaning |
|---|---|
| Gestating | In utero; expected birth date set |
| Born | Litter born; wean date set |
| Weaned | Pups moved to separate cages |

---

## 13. GitHub Sync Workflow

### How data is stored
All colony data is saved as `data/colony.json` in the `main` branch of the `shreythaker/ColonyOS` repository. This is separate from the deployed app files (which live on the `gh-pages` branch).

### On every page load
The app always fetches `data/colony.json` from the public GitHub raw URL — no PAT required. The decision of whether to apply it:
- **Viewer (no PAT):** GitHub data always wins over local cache
- **Editor (with PAT), no dirty flag:** timestamps decide; whichever is newer is used
- **Editor (with PAT), dirty flag set:** GitHub always wins — local changes are considered unpushed and stale

### The dirty flag
A flag (`colonyos_gh_dirty`) is written to localStorage whenever any user action occurs (cage edit, pair update, litter change, Excel import). It is cleared only when a successful GitHub push or pull completes. This flag persists across page reloads, ensuring that if you refresh before pushing, GitHub data still takes precedence.

### Pushing
Click **↑ Push to GitHub** in the header. This calls the GitHub Contents API to write the current state as a JSON file. A `savedAt` timestamp is embedded in the JSON for sync ordering.

### Warning on close
If the dirty flag is set when you try to close or refresh the tab, the browser shows a generic "leave site?" confirmation dialog.

---

## 14. Excel Import / Export

### Export
Click **Export Excel** in the header at any time. Downloads a `.xlsx` file with three sheets:

| Sheet | Contents |
|---|---|
| Cages | All cage records including deleted |
| Litters | All litter records including deleted |
| Mating Pairs | All mating pair records |

The export is a full backup and can be used to restore data via Import.

### Import
In Settings → Advanced → Import Excel. Select a previously exported `.xlsx` file. **All current data is replaced.** The app immediately marks the data as having unsaved GitHub changes (dirty flag set) so a push is required before closing.

### Notes
- Import reads the exact column structure from the export. Do not rename sheet tabs or column headers.
- Import does not validate biology rules — it restores whatever was in the file.
- After import, verify data on the Dashboard before pushing to GitHub.
