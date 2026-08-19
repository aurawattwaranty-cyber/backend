function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildTextPdf(lines: string[], title = "Aurawatt Warranty Certificate"): Buffer {
  const contentLines = [
    "BT",
    "/F1 14 Tf",
    "72 760 Td",
    `(${escapePdfText(title)}) Tj`,
    "0 -28 Td",
    "/F1 11 Tf",
  ];

  lines.forEach((line) => {
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push("0 -18 Td");
  });
  contentLines.push("ET");

  const content = contentLines.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj\n`,
  ];

  const header = "%PDF-1.4\n";
  let offset = Buffer.byteLength(header, "utf8");
  const offsets = [0];
  let body = "";

  for (const object of objects) {
    offsets.push(offset);
    body += object;
    offset += Buffer.byteLength(object, "utf8");
  }

  const xrefOffset = Buffer.byteLength(header + body, "utf8");
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, "0")} 00000 n `),
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    `${xrefOffset}`,
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(header + body + xref, "utf8");
}
