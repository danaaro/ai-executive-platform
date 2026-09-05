import {
  createIntakeBlockFilter,
  splitIntakeBlock,
  sectionOf,
  INTAKE_ANSWERS_MARKER,
} from "../src/shared/intake-answers";

/**
 * Guards the [INTAKE ANSWERS] contract — the mechanism that turns intake from
 * transcript-plus-LLM-guesswork into a table.
 *
 * Two failure modes are worth a test rather than a code read, because both are
 * silent and both are seen by the customer:
 *
 *  1. The block LEAKS to the user. On text it is a wall of JSON at the end of
 *     every answer; on voice it is read aloud, character by character, to a
 *     hiring manager. The stream filter has to hold back a partial marker
 *     split across chunk boundaries, and chunk boundaries are wherever the
 *     model's tokenizer happened to land — never where a test would put them.
 *  2. The block is DROPPED. A malformed emission must cost one turn of
 *     bookkeeping and nothing else: the reply still has to be delivered and
 *     stored, because the transcript is the record of last resort.
 *
 *   npx tsx scripts/test-intake-answers.ts
 */

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const BLOCK =
  `${INTAKE_ANSWERS_MARKER}\n` +
  `{"answers":[` +
  `{"id":"1.3","status":"answered","source":"typed","answer":"New position"},` +
  `{"id":"7.1","status":"skipped","source":"typed"}` +
  `]}`;
const REPLY = "Thanks — that's helpful.\n\nWhat's driving the timing on this hire?";

console.log("--- splitIntakeBlock ---");
{
  const { visibleText, answers } = splitIntakeBlock(`${REPLY}\n\n${BLOCK}`);
  check("visible text excludes the block", !visibleText.includes("INTAKE ANSWERS"), visibleText);
  check("visible text is the reply", visibleText === REPLY, JSON.stringify(visibleText));
  check("both answers parsed", answers.length === 2, String(answers.length));
  check(
    "section derived from question id",
    answers[0]?.sectionId === 1 && answers[1]?.sectionId === 7
  );
  check("answer text kept", answers[0]?.answer === "New position");
  check("no answer text for skipped", answers[1]?.answer === null);
}
{
  const { visibleText, answers } = splitIntakeBlock(REPLY);
  check("turn with no block is untouched", visibleText === REPLY && answers.length === 0);
}
{
  const { visibleText, answers } = splitIntakeBlock(
    `${REPLY}\n\n${INTAKE_ANSWERS_MARKER}\n{"answers":[{"id":"1.3",`
  );
  check(
    "malformed JSON costs the block, not the reply",
    visibleText === REPLY && answers.length === 0
  );
}
{
  const { answers } = splitIntakeBlock(
    `x\n${INTAKE_ANSWERS_MARKER}\n{"answers":[` +
      `{"id":"2.1","status":"nonsense","source":"typed"},` +
      `{"id":"not-an-id","status":"answered","source":"typed"},` +
      `{"id":"2.2","status":"answered","source":"telepathy"},` +
      `{"id":"2.3","status":"answered","source":"document"}` +
      `]}`
  );
  check("invalid rows dropped, valid row kept", answers.length === 1 && answers[0].questionId === "2.3");
}
{
  const { answers } = splitIntakeBlock(
    `x\n${INTAKE_ANSWERS_MARKER}\n{"answers":[` +
      `{"id":"3.1","status":"unknown","source":"typed"},` +
      `{"id":"3.1","status":"answered","source":"typed","answer":"Actually, yes"}` +
      `]}`
  );
  check(
    "later entry for the same question wins",
    answers.length === 1 && answers[0].status === "answered",
    JSON.stringify(answers)
  );
}
check("sectionOf rejects non-ids", sectionOf("abc") === null && sectionOf("0.1") === null);
check("sectionOf reads two-digit sections", sectionOf("14.2") === 14);

console.log("\n--- createIntakeBlockFilter (streaming) ---");
/** Feeds text through the filter in fixed-size chunks and returns what escaped. */
function streamThrough(text: string, chunkSize: number): string {
  const f = createIntakeBlockFilter();
  let out = "";
  for (let i = 0; i < text.length; i += chunkSize) {
    out += f.push(text.slice(i, i + chunkSize));
  }
  return out + f.flush();
}

const FULL = `${REPLY}\n\n${BLOCK}`;
{
  // Every chunk size from 1 up: size 1 splits the marker maximally, and sizes
  // near the marker length are where an off-by-one in the held-back tail hides.
  const leaks: number[] = [];
  const truncated: number[] = [];
  for (let size = 1; size <= 64; size++) {
    const out = streamThrough(FULL, size);
    if (out.includes("INTAKE") || out.includes("answers")) leaks.push(size);
    if (out.trimEnd() !== REPLY) truncated.push(size);
  }
  check("block never leaks at any chunk size", leaks.length === 0, `leaked at sizes ${leaks}`);
  check(
    "reply delivered intact at any chunk size",
    truncated.length === 0,
    `wrong output at sizes ${truncated}`
  );
}
{
  // A turn that never emits a block must not have its tail eaten by the
  // held-back buffer — this is what flush() is for.
  const leaks: number[] = [];
  for (let size = 1; size <= 64; size++) {
    if (streamThrough(REPLY, size) !== REPLY) leaks.push(size);
  }
  check("no-block turn survives flush at any chunk size", leaks.length === 0, `sizes ${leaks}`);
}
{
  const f = createIntakeBlockFilter();
  f.push(`${REPLY}\n\n${BLOCK}`);
  check("nothing escapes after the marker", f.push("more json") === "" && f.flush() === "");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
