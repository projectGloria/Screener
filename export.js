const formats = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };

// Preserve the full screenshot on one proportionally sized PDF page.
// Embed the browser's JPEG directly; all offsets below count bytes, not text.
async function screenshotPdf(jpeg, width, height) {
  const scale = Math.min(.75, 14400 / width, 14400 / height);
  const w = (width * scale).toFixed(4), h = (height * scale).toFixed(4);
  const encoder = new TextEncoder();
  const chunks = [], offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body, stream) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}`);
    if (stream) { append('\nstream\n'); append(stream); append('\nendstream'); }
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, bytes);
  const commands = encoder.encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Image Do\nQ\n`);
  object(5, `<< /Length ${commands.length} >>`, commands);
  const xref = length;
  append('xref\n0 6\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: formats.pdf });
}

export async function exportCapture(capture, format) {
  if (!formats[format]) throw new Error('Choose a supported download format.');
  if (format === 'png') return capture.blob;
  const bitmap = await createImageBitmap(capture.blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (format === 'jpg' || format === 'pdf') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const type = format === 'pdf' ? formats.jpg : formats[format];
    const blob = await canvas.convertToBlob({ type, quality: .95 });
    if (blob.type !== type) throw new Error('This browser cannot export that format. Choose PNG instead.');
    return format === 'pdf' ? screenshotPdf(blob, bitmap.width, bitmap.height) : blob;
  } finally { bitmap.close(); }
}
