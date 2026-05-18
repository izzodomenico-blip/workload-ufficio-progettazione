\---

name: workload-crm-logic-guard

description: Use this skill whenever the user asks to change workload logic, CRM logic, project/task/person data, absences, holidays, permits, sick leave, weekly capacity, workload calculations, localStorage persistence, JSON import/export, report data generation, or any feature that could affect business rules in the workload office planning app. This skill must also be used when UI changes touch calculated values or stored data.

\---



\# Workload CRM Logic Guard Skill



\## Project context



This project manages the workload of a mechanical design office.



The app handles:



\- people

\- tasks

\- projects / commesse

\- workload

\- progress

\- weekly planning

\- absences

\- holidays / ferie

\- permits / permessi

\- sick leave / malattie

\- localStorage persistence

\- JSON import/export

\- weekly reports



There is no backend and no database unless explicitly requested.



\## Main objective



Protect the business logic while allowing controlled improvements.



The user values correctness, traceability, compatibility with saved data, and avoiding accidental rewrites.



\## Critical rules



Do not change the data model without explicit reason.



Do not break compatibility with existing localStorage data.



Do not remove existing fields unless a migration is created.



Do not rename types, fields, keys, or utility functions casually.



Do not change workload, availability, progress, or weekly report calculations without explaining why.



Do not introduce backend, database, authentication, cloud sync, or server logic unless explicitly requested.



Do not replace the existing architecture with a larger framework.



Do not make broad rewrites.



Do not modify business rules while doing only visual/UI improvements.



\## Before changing logic



Inspect the relevant files first.



Likely important files:



\- src/types/index.ts

\- src/state/DataProvider.tsx

\- src/services/dataService.ts

\- src/storage/localStorage.ts

\- src/utils/workload.ts

\- src/utils/availability.ts

\- src/utils/progress.ts

\- src/utils/weeklyReport.ts

\- src/components/



Before modifying anything, understand:



1\. Current data model

2\. Existing localStorage keys

3\. Existing import/export JSON format

4\. Existing calculations

5\. Existing UI dependencies

6\. Backward compatibility risks



\## Safe change process



For every logic change:



1\. Explain the intended change

2\. Identify impacted files

3\. Keep the change minimal

4\. Preserve backward compatibility

5\. Add fallback handling for missing old fields

6\. Avoid duplicated calculations in UI components

7\. Validate with build

8\. Summarize risk



\## Absence logic



Absences may include:



\- holidays / ferie

\- permits / permessi

\- sick leave / malattie



When changing absence logic, preserve clear separation between:



\- available capacity

\- planned workload

\- actual task load

\- absence impact

\- weekly impact

\- person status



\## Workload logic



When changing workload calculations, preserve clarity between:



\- assigned hours

\- available hours

\- overload

\- underload

\- blocked time

\- absence impact

\- weekly view

\- next week forecast



\## Report logic



Report data should be generated from the existing source of truth.



Avoid duplicating report calculations inside UI components.



Prefer pure utility functions for report data.



Do not change weeklyReport calculations unless necessary.



If a calculation must change, explain:



\- previous logic

\- new logic

\- reason for change

\- compatibility impact



\## LocalStorage and import/export rules



Preserve existing localStorage compatibility.



If new fields are added:



\- make them optional where possible

\- provide defaults

\- support older saved data

\- avoid breaking JSON import



Do not delete or overwrite saved user data during refactors.



\## Validation commands



After changes, run:



```bash

npm run typecheck

npm run build

