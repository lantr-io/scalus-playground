// Splits program output into the sections written by scalus.playground.Playground (src/scala/Playground.scala).

// Lines `=== <section> ===` ... `=== end ===`.
const SectionLine = /^=== (\w+) ===$/;

export interface BudgetRow {
  label: string;
  success: boolean;
  memory: string;
  steps: string;
  logs: string;
}

export interface ParsedOutput {
  console: string;
  size?: string;
  uplc?: string;
  cbor?: string;
  budget: BudgetRow[];
}

export function parseOutput(text: string): ParsedOutput {
  const result: ParsedOutput = { console: "", budget: [] };
  const consoleLines: string[] = [];
  let section: string | null = null;
  let body: string[] = [];

  for (const line of text.split("\n")) {
    const marker = SectionLine.exec(line);
    if (marker) {
      const name = marker[1];
      if (name === "end" && section) {
        store(result, section, body.join("\n"));
        section = null;
      } else {
        section = name;
        body = [];
      }
    } else if (section) {
      body.push(line);
    } else {
      consoleLines.push(line);
    }
  }
  result.console = consoleLines.join("\n").trim();
  return result;
}

function store(result: ParsedOutput, section: string, text: string) {
  switch (section) {
    case "size":
      result.size = text.trim();
      break;
    case "uplc":
      result.uplc = text;
      break;
    case "cbor":
      result.cbor = text.trim();
      break;
    case "budget": {
      const [label, success, memory, steps, logs] = text.split("\t");
      result.budget.push({ label, success: success === "true", memory, steps, logs: logs ?? "" });
      break;
    }
  }
}
