import { StreamLanguage, type StreamParser } from "@codemirror/language";

// Syntax highlighting for the UPLC text format printed by Program.show.
const keywords = new Set(["program", "lam", "con", "builtin", "force", "delay", "case", "constr", "error"]);
const types = new Set(["integer", "bytestring", "string", "bool", "unit", "data", "list", "pair", "array", "value"]);

const parser: StreamParser<null> = {
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^#[0-9a-fA-F]*/)) return "number";
    if (stream.match(/^-?\d+(\.\d+)*/)) return "number";
    if (stream.match(/^(True|False)\b/)) return "atom";
    if (stream.match(/^[()[\]]/)) return "bracket";
    const word = stream.match(/^[A-Za-z_][\w'.]*/) as RegExpMatchArray | null;
    if (word) {
      if (keywords.has(word[0])) return "keyword";
      if (types.has(word[0])) return "typeName";
      return "variableName";
    }
    stream.next();
    return null;
  },
};

export const uplc = StreamLanguage.define(parser);
