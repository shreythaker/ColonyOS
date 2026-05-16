# ColonyOS — Mouse Colony Management App

## Project Overview
A React (Vite) single-page app for managing a research mouse colony. Runs in the browser with localStorage persistence. Exports to Excel. Built with lucide-react icons and xlsx library.

**Entry point:** `colonyos/src/App.jsx` (single-file app, ~1600+ lines)

---

## Biology & Colony Rules

### Strains
- **Strain A** and **Strain B** are the two parent strains
- **Strain AB** = A × B cross → has the disease phenotype between **4–10 weeks of age**
- Steady-state parent populations must be maintained at all times

### Age & Fertility
- Weaning age: **3 weeks** post-birth
- Female fertility window: **8–36 weeks** (age out at **35+ weeks**)
- Males: age out at **35+ weeks** (notify for euthanasia to reduce costs)

### Breeding Timeline
- Time to pregnancy after pairing: **1–2 weeks**
- Gestation period: **~3 weeks**
- Litter size: **6–8 pups**, slightly more females than males

### Mating Setup Rules
- **Pair:** 1 female + 1 male
- **Harem:** up to 3 females + 1 male — **requires a proven male** (hasBreed = true)
- Males cannot be re-housed after separation (aggression)
- Females can be re-housed after separation but get a **new cage card** (can't be returned to original cage — no individual tags, only cage tracking)

### Lineage & Relatedness
- Track `parentLitterId` per cage for lineage
- Avoid mating direct siblings from the same litter
- Relatedness coefficient computed via recursive ancestor walk (see `computeRelatedness` in App.jsx)
- Litter ID system for heredity tracking

---

## Cage Rules
- Max **4 mice per cage**
- Each cage costs **$1/day** to house
- Cages identified by cage card number (e.g., C001) — no individual mouse tags
- Cage operations: split (one mouse leaves → new cage), merge (females only, new cage card)
- Full audit trail for split/merge operations

---

## App Architecture (colonyos/src/App.jsx)

### State / Data Models
```
cages[]         — cage records (id, strain, sex, mouseCount, dob, status, hasBreed, litterHistory, parentLitterId, experimentId)
litters[]       — litter records (id, strain, motherCageId, fatherCageId, matingPairId, birthDate, weanDate, expectedBirthDate, numPups, numMales, numFemales, status, offspringCageIds)
matingPairs[]   — mating pair/harem records (id, type, strain, maleCageId, femaleCageIds, setupDate, status, lastStatusUpdate, litterIds)
experiments[]   — experiment cohort records (id, name, strain, targetN, enrolledCageIds, startDate, endDate, status)
settings{}      — email, alert thresholds, notification toggles
auditLog[]      — timestamped log of all cage/litter/pair operations
```

### Tabs / Views
| Component | Description |
|---|---|
| `Dashboard` | Colony overview, alerts (weaning due, aging out, low colony), cost summary |
| `Colony` | Cage table — add, split, merge, search, sort |
| `Breeding` | Mating pairs, litter tracking, pregnancy status updates |
| `LineageView` | SVG family tree per cage, relatedness checker |
| `ExperimentsView` | Experiment cohorts, enroll AB cages, multi-cohort tracking |
| `Planner` | Input sample size → estimate # mating pairs needed + timeline |
| `Costs` | Monthly cost breakdown, cage-days, cost minimization suggestions |
| `SettingsPanel` | Email, alert thresholds (wean alert days, age-out weeks, min colony sizes) |

### Key Constants
- `TODAY` is hardcoded for demo (`new Date("2026-05-12")`) — change when deploying live
- `STORAGE_KEY = "colonyos_v2"` for localStorage
- `STRAIN_META`, `STATUS_META` define colors/labels for badges

---

## Features

### Implemented
- Cage CRUD with split/merge and audit log
- Mating pair/harem setup with sibling/relatedness warnings
- Litter tracking: gestating → born → weaned lifecycle
- Lineage SVG visualization with relatedness coefficient
- Experiment cohort tracking with AB cage enrollment
- Planner: sample size → mating pairs + timeline estimate
- Monthly cost tracking ($1/cage/day)
- Settings: email notifications, age-out threshold, min colony sizes
- Excel export via xlsx
- localStorage persistence

### Planned / In Progress
- Email notification delivery (currently UI-only; needs backend or EmailJS integration)
- Cost minimization suggestions (flag redundant singly-housed mice)
- Full deploy with persistent backend (currently browser-only)

---

## Running the App
```powershell
cd colonyos
npm run dev       # requires PowerShell execution policy: RemoteSigned
# OR
npx vite          # if npm.ps1 is blocked
```
App runs at **http://localhost:5173**

Note: On first install on Windows, npm may require:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## Excel Export
- Uses `xlsx` library
- Exports cages, litters, mating pairs as separate sheets
- Designed to mirror the lab's shared Excel tracking sheet

---

## Key Design Decisions
- Single-file React app (App.jsx) — intentional for portability
- No backend; localStorage only — avoids infrastructure overhead for lab use
- Dark theme (GitHub-style color palette) defined in constant `C`
- Inline styles throughout (no CSS modules or Tailwind) for portability
- Cage = unit of tracking (no individual mouse tags)
