# Content Tracker.xlsx: layout and rules

One Excel file in the Launch folder: `Content Tracker.xlsx`. Create it with your file-creation tools (for example Python with openpyxl). Always read the current file before writing, and keep every existing row.

## Tab 1: Pipeline

Header in row 1, frozen. One row per post.

| Col | Header | Values | Who writes |
|---|---|---|---|
| A | ID | P001, P002, … (never reused) | You |
| B | Topic | short title | You or user |
| C | Pillar | one of the pillars in `content-strategy.md` | You |
| D | Idea source | Research / Mine / Pipeline | You |
| E | Status | Idea · Drafting · Awaiting approval · Approved · Posted · Dropped | You, on the user's word |
| F | Planned date | date | You (from `/launch:plan-week`) or user |
| G | Hook | first line of the draft | You |
| H | Draft | full current draft | You |
| I | Final posted text | the text actually published | You, from what the user gives you |
| J | Posted date | date | You, when the user says it's posted |
| K | Post URL | link | User |
| L | Sources | links used for research | You |
| M | Notes | anything else | Either |

Status changes only on the user's word: "approve" → Approved; "I posted it" → Posted. Never infer Posted from a date passing.

## Tab 2: Stats

| Col | Header |
|---|---|
| A | ID (matches Pipeline) |
| B | Topic |
| C | Posted date |
| D | Impressions |
| E | Reactions |
| F | Comments |
| G | Reposts |
| H | Engagement rate (formula: `=(E+F+G)/D`, as %) |
| I | Logged on |
| J | Source (Pasted / Read in Chrome) |

Add a bar chart of Impressions by post next to the table, and refresh it when rows are added. If chart creation fails, skip it silently; the numbers matter more.

## Tab 3: Commands

Paste the two tables from `${CLAUDE_PLUGIN_ROOT}/reference/commands-card.md` here, so the commands are visible inside the tracker.

## Rules

- Find a row by ID, else by Topic. Never by row number.
- Never overwrite the user's text in columns I and K. If a cell already holds something different, show the conflict and ask.
- Never put a number in Stats that the user didn't give you or that you didn't read from their LinkedIn analytics. An empty cell beats a guess.
- If the file is open in Excel, ask the user to close it before you write, then reopen.
- **Fallback:** if you can't create or edit `.xlsx` files (file creation is switched off), say once: "Turn on Settings › Capabilities › Code execution and file creation so I can keep your Excel tracker." Until then, keep the same columns as markdown tables in `Content Tracker.md`, and convert it to Excel once it's on.
