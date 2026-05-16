\---

name: workload-report-designer

description: Use this skill whenever the user asks to create, improve, export, redesign, print, or generate a weekly workload report, PDF report, executive summary, management report, graphical report, workload overview, people workload report, absences report, holidays/permits/sick leave section, next week forecast, traffic-light report, or printable report in the workload office planning app.

\---



\# Workload Report Designer Skill



\## Project context



This project manages weekly workload reports for a mechanical design office.



The report is intended for management and should show:



\- what each person is doing

\- workload level per person

\- absences such as holidays, permits, and sick leave

\- critical tasks

\- delays

\- next week forecast

\- concise management summary



\## Main objective



Create a clear, executive, printable/PDF-friendly weekly report.



The report must be concise, readable, professional, and useful for a weekly management update.



\## Mandatory report sections



The weekly report should include:



1\. Executive summary

2\. Workload by person

3\. What each person is working on

4\. Holidays, permits, and sick leave

5\. Critical issues and delays

6\. Next week focus



\## Design rules



The report should be maximum 1-2 pages when possible.



Use less information, but make it more readable.



Prefer visual summaries over long text.



Use:



\- traffic-light indicators

\- badges

\- compact tables

\- person cards

\- progress bars

\- weekly focus box

\- criticality box

\- absence section

\- short notes

\- clear section titles



Avoid:



\- overloaded tables

\- excessive text

\- raw JSON-like data

\- too many technical details

\- unreadable small fonts

\- crowded dashboard-style pages



\## PDF/export strategy



Prefer lightweight implementation first:



\- print-friendly HTML

\- CSS print styles

\- dedicated report preview component

\- browser print to PDF

\- window.print()



Avoid heavy PDF libraries unless necessary.



If a PDF library is needed, explain the reason before adding it.



\## Data rules



Use existing report data where possible.



Do not duplicate business logic in the report component.



Do not change weeklyReport calculations unless necessary.



If the data shape is insufficient, propose a minimal extension.



Use the workload-crm-logic-guard skill together with this one when report changes touch:



\- data model

\- workload calculations

\- absence calculations

\- localStorage

\- JSON import/export

\- report utilities



\## Likely files to inspect



\- src/utils/weeklyReport.ts

\- src/utils/workload.ts

\- src/utils/availability.ts

\- src/types/index.ts

\- src/state/DataProvider.tsx

\- src/storage/localStorage.ts

\- src/components/

\- src/App.tsx



\## Suggested implementation approach



1\. Review existing weekly report utilities

2\. Review current report/export UI

3\. Propose report structure before coding

4\. Create or improve report data structure only if needed

5\. Create a report preview component

6\. Add print-friendly layout

7\. Add export/print button

8\. Validate build

9\. Provide browser test steps



\## Preferred report style



The report should feel:



\- executive

\- clean

\- professional

\- readable at a glance

\- suitable for CEO / management

\- not overloaded

\- not too colorful

\- easy to export as PDF



\## Validation commands



After changes, run:



```bash

npm run build

