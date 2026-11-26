/** Baixa um arquivo gerado no navegador (nada passa por servidor). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(text: string, fileName: string, type: string): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

/** Lê um arquivo escolhido pela pessoa, recusando os grandes demais antes de carregar na memória. */
export async function readFileText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`Arquivo grande demais (limite de ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }
  return file.text();
}
