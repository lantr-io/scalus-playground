// "Export" downloads the code as a scala-cli project that runs on the JVM with published Scalus.

/** The Scala version Scalus publishes its compiler plugin for (scalus-plugin_3.3.8). */
const ScalaVersion = "3.3.8";

export function scalaCliProject(scalusVersion: string, main: string, prelude: string): Map<string, string> {
  const project = [
    `//> using scala ${ScalaVersion}`,
    `//> using dep org.scalus::scalus:${scalusVersion}`,
    `//> using dep org.scalus::scalus-cardano-ledger:${scalusVersion}`,
    `//> using plugin org.scalus:::scalus-plugin:${scalusVersion}`,
    "",
  ].join("\n");
  const readme = [
    "Scalus Playground export (https://play.scalus.org)",
    "",
    "Run it with scala-cli (https://scala-cli.virtuslab.org):",
    "",
    "    scala-cli run .",
    "",
    "Main.scala is your code. Playground.scala holds the helpers the playground provides",
    "(Party, Playground.lockedUtxo, tx.scriptContextV3, Playground.show, Playground.budget).",
    "",
  ].join("\n");
  return new Map([
    ["project.scala", project],
    ["Main.scala", main],
    ["Playground.scala", prelude],
    ["README.txt", readme],
  ]);
}

/** A zip archive of text files, stored uncompressed (they are small). */
export function zip(files: Map<string, string>): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = header(30, nameBytes, (v) => {
      v.setUint32(0, 0x04034b50, true); // local file header
      v.setUint16(4, 20, true); // version needed
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, nameBytes.length, true);
    });
    central.push(
      header(46, nameBytes, (v) => {
        v.setUint32(0, 0x02014b50, true); // central directory entry
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, data.length, true);
        v.setUint32(24, data.length, true);
        v.setUint16(28, nameBytes.length, true);
        v.setUint32(42, offset, true);
      }),
    );
    parts.push(local, data);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true); // end of central directory
  v.setUint16(8, files.size, true);
  v.setUint16(10, files.size, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/zip" });
}

function header(size: number, name: Uint8Array, fill: (v: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size + name.length);
  fill(new DataView(bytes.buffer));
  bytes.set(name, size);
  return bytes;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
