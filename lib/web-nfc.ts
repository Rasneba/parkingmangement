export interface WebNfcReadingEvent extends Event {
  serialNumber?: string;
}

export interface WebNfcReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(
    type: "reading",
    listener: (event: WebNfcReadingEvent) => void
  ): void;
}

type WebNfcReaderConstructor = new () => WebNfcReader;

export function isWebNfcSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as { NDEFReader?: WebNfcReaderConstructor }).NDEFReader === "function";
}

export function createWebNfcReader(): WebNfcReader | null {
  if (!isWebNfcSupported()) return null;
  const Reader = (window as unknown as { NDEFReader: WebNfcReaderConstructor }).NDEFReader;
  return new Reader();
}
