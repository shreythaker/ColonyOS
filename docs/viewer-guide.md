# ColonyOS — Viewer Guide

**App URL:** https://shreythaker.github.io/ColonyOS/

This guide is for lab members who want to check on the colony. You don't need an account or password — just open the link and the latest data loads automatically.

---

## What is ColonyOS?

ColonyOS is a live dashboard for the Montrose Lab mouse colony. It tracks all cages, breeding pairs, litters, and experiments in one place. Data is updated by the colony manager and synced to the cloud — what you see is always current.

---

## Navigating the App

Click any tab in the top navigation bar to switch views.

| Tab | What you'll find there |
|---|---|
| **Dashboard** | Quick summary, active alerts, and upcoming events |
| **Colony** | Full list of all cages and their current status |
| **Breeding** | Active mating pairs and litter tracking |
| **Lineage** | Family tree and relatedness tool |
| **Experiments** | Cohort tracking for disease onset studies |
| **Planner** | Sample size and timeline calculator |
| **Costs** | Housing cost breakdown |
| **Settings** | Configuration (editor only) |

---

## Dashboard

The first thing you see when you open the app. It has four sections:

### Summary cards (top row)
- **Total Mice** — how many mice are currently housed
- **Est. Monthly** — estimated housing cost this month at $1/cage/day
- **AB In Window** — how many Apcfl/fl×Cdx2Cre mice are currently in the 4–10 week disease phenotype window
- **Active Litters** — number of litters currently gestating or born

### Active Alerts
Color-coded flags that need attention:

🔴 **Red (Danger)** — needs action soon
- A cage has reached the retirement age threshold (35+ weeks)
- A parent strain has dropped below the minimum cage count

🟡 **Amber (Warning)** — coming up soon
- A litter is due to be weaned within the next 7 days
- A cage is approaching retirement age

### Upcoming Events
A timeline of the next expected births and weanings, sorted by date. Red dates are within 3 days.

### Colony Overview
A quick table showing how many male and female cages exist per strain, and how many active crosses are running.

---

## Colony

Shows every cage grouped by status. Click the arrow next to a status group to expand or collapse it.

### What the columns mean

| Column | Meaning |
|---|---|
| **DLAR ID** | The physical cage card number on the rack |
| **Colony ID** | Internal reference number (e.g., C001) |
| **Strain** | Which mouse strain is in this cage |
| **Sex** | M = male, F = female |
| **Count** | Number of mice in the cage |
| **DOB** | Date of birth |
| **Age** | How old the mice are in weeks |
| **Status** | Current cage status (see color guide below) |
| **Bred** | ✓ means this cage has produced a litter before |
| **Parent Litter** | Which litter these mice came from (if known) |
| **Exp.** | Experiment this cage is enrolled in (if any) |
| **Notes** | Any notes added by the colony manager |

### Cage status colors

| Color | Status | What it means |
|---|---|---|
| 🟢 Green | Active | Normal housing |
| 🟡 Yellow | Mating | Paired with a mate |
| 🩷 Pink | Pregnant | Pregnancy confirmed |
| 🟣 Purple | Weaning | Pups present, wean date approaching |
| ⚫ Gray | Retired | Removed from breeding colony |
| 🔴 Red | Euthanized | Cage closed, mice no longer present |

### Strains

| Label in app | Full name | Color |
|---|---|---|
| Apcfl/fl | Strain A — floxed Apc allele | Blue |
| Cdx2Cre | Strain B — Cre driver | Orange |
| Apcfl/fl×Cdx2Cre | Strain AB — disease model | Purple |

---

## Breeding

### Mating Pairs tab
Lists all active breeding set-ups. Each entry shows:
- The pair or harem ID
- Which cages are involved (male and female)
- When the pair was set up
- Current status: **Waiting → Pregnant → Birthed → Retired**

### Litters tab
Tracks every litter from conception to weaning:
- **Gestating** — in utero, expected birth date shown
- **Born** — pups born, wean date shown
- **Weaned** — pups moved to their own cages

---

## Lineage

### Family Tree
Pick any cage from the dropdown to see a diagram of its ancestry — up to 3 generations back.

### Relatedness Checker
Pick two cages to see how closely related they are. This is used to avoid inbreeding when setting up new pairings.

---

## Experiments

Lists all experiment cohorts. Each cohort tracks a group of AB (disease model) mice being monitored for the phenotype onset between 4 and 10 weeks of age.

- **Planned** — not yet started
- **Active** — mice enrolled, monitoring in progress
- **Completed** — experiment closed, end date recorded

The progress bar shows enrolled mice vs. the target number.

---

## Planner

Enter a target number of AB mice and a target date. The Planner calculates:
- How many mating pairs to set up
- Which specific cages to pair
- A week-by-week timeline to reach the target
- An estimated housing cost

This is a read-only planning tool — it doesn't make any changes to the colony.

---

## Costs

Shows housing costs at $1 per cage per day. Useful for tracking how much each strain or cohort is costing to maintain. The per-cage table is sorted from most expensive to least.

---

## Frequently Asked Questions

**The page loaded but I see old data — what do I do?**  
Try a hard refresh: press **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac). The app always fetches the latest data from the cloud when it loads.

**I see "default" cage names like C001, C002. Is this the real data?**  
If those cages don't match the physical colony, the app may still be loading. Wait a few seconds and refresh. If the problem persists, let the colony manager know.

**Can I accidentally change anything?**  
No. Editing requires a Personal Access Token that only the colony manager has configured. As a viewer you can click around freely — nothing is editable.

**What does "AB In Window" mean?**  
AB mice (Apcfl/fl×Cdx2Cre) develop the intestinal phenotype between 4 and 10 weeks of age. "In Window" means those mice are currently in that age range and available for experiments.

**Who do I contact if something looks wrong?**  
Contact the colony manager. Share the cage ID (Colony ID column) or litter ID so they can locate the record quickly.
