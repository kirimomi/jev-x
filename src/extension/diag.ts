/**
 * Pipeline diagnostics (Issue #16)
 *
 * Records checkpoints of the content -> background evaluation pipeline into
 * chrome.storage.local so the user can see, from the options page, exactly
 * how far processing got and where it stopped. This exists for environments
 * without a web inspector (e.g. Orion on iPad), where console logs from the
 * existing logger cannot be read.
 *
 * Recording is fire-and-forget: a diagnostics failure must never break the
 * filtering pipeline, so all errors are swallowed.
 */

export interface DiagEntry {
  stage: string;
  ts: number;
  detail?: string;
}

export const DIAG_STORAGE_KEY = 'jevxDiag';
export const DIAG_MAX_ENTRIES = 100;

// Serialize writes within this context so rapid successive marks do not lose
// entries to read-modify-write races. (Cross-context races between the
// content script and the background can still drop an entry on rare
// collisions; acceptable for diagnostics.)
let writeQueue: Promise<void> = Promise.resolve();

function storageAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export function markDiag(stage: string, detail?: string): void {
  if (!storageAvailable()) return;
  writeQueue = writeQueue
    .then(async () => {
      try {
        const data = await chrome.storage.local.get([DIAG_STORAGE_KEY]);
        const entries: DiagEntry[] = Array.isArray(data[DIAG_STORAGE_KEY])
          ? (data[DIAG_STORAGE_KEY] as DiagEntry[])
          : [];
        entries.push({ stage, ts: Date.now(), detail });
        while (entries.length > DIAG_MAX_ENTRIES) entries.shift();
        await chrome.storage.local.set({ [DIAG_STORAGE_KEY]: entries });
      } catch {
        // Diagnostics must never break the pipeline.
      }
    })
    .catch(() => undefined);
}

export async function readDiag(): Promise<DiagEntry[]> {
  if (!storageAvailable()) return [];
  try {
    const data = await chrome.storage.local.get([DIAG_STORAGE_KEY]);
    return Array.isArray(data[DIAG_STORAGE_KEY]) ? (data[DIAG_STORAGE_KEY] as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearDiag(): Promise<void> {
  if (!storageAvailable()) return;
  try {
    await chrome.storage.local.remove([DIAG_STORAGE_KEY]);
  } catch {
    // ignore
  }
}
