import { beforeEach, describe, expect, it, vi } from "vitest";

const recordUploadedFile = vi.fn(async (_a: unknown) => "file-id");
const refreshDrive = vi.fn();
vi.mock("@/lib/storage", () => ({ recordUploadedFile: (a: unknown) => recordUploadedFile(a), refreshDrive: (d: string) => refreshDrive(d) }));
vi.mock("@/lib/keep-awake", () => ({ keepScreenAwake: () => () => {} }));
vi.mock("@/lib/cord-signal", () => ({ signalCordSync: () => {} }));
vi.mock("@/lib/crypto/vault-crypto", () => ({ encryptBlob: vi.fn() }));
vi.mock("@/lib/e2ee-client/file-crypto", () => ({ prepareEncryptedUpload: vi.fn() }));
vi.mock("@/lib/discord", () => ({ DiscordApiError: class extends Error {} }));

import { useUploadQueue } from "./upload-queue";

const manifest = { size: 1, mimeType: "", filename: "f", chunkSize: 1, chunks: [] };
const fakeClient = (tag: string, log: string[]) =>
  ({
    uploadFile: async (f: File) => { log.push(`${tag}:${f.name}`); return manifest; },
    deleteFile: async () => {},
  }) as never;

beforeEach(() => {
  recordUploadedFile.mockClear();
  refreshDrive.mockClear();
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  useUploadQueue.setState({ items: [], _internal: new Map(), _pumping: false });
});

describe("upload queue", () => {
  it("uploads every file, records them silently and refreshes the drive once per batch", async () => {
    const log: string[] = [];
    const seen: string[] = [];
    const files = Array.from({ length: 5 }, (_, i) => new File(["x"], `f${i}.txt`));
    useUploadQueue.getState().enqueue({
      files, driveId: "d1", parentId: "" as never, client: fakeClient("A", log),
      onUploaded: (it) => seen.push(it.fileName),
    });
    await vi.waitFor(() => expect(useUploadQueue.getState()._pumping).toBe(false));

    expect(useUploadQueue.getState().items.every((i) => i.status === "done")).toBe(true);
    expect(recordUploadedFile).toHaveBeenCalledTimes(5);
    expect(recordUploadedFile.mock.calls.every(([a]) => (a as { silent: boolean }).silent === true)).toBe(true);
    expect(refreshDrive).toHaveBeenCalledTimes(1); // not once per file
    expect(seen).toEqual(files.map((f) => f.name));
  });

  it("each batch keeps its own client and callback", async () => {
    const log: string[] = [];
    const a: string[] = [];
    const b: string[] = [];
    const q = useUploadQueue.getState();
    q.enqueue({ files: [new File(["x"], "a.txt")], driveId: "d1", parentId: "" as never, client: fakeClient("A", log), onUploaded: (i) => a.push(i.fileName) });
    q.enqueue({ files: [new File(["x"], "b.txt")], driveId: "d1", parentId: "" as never, client: fakeClient("B", log), onUploaded: (i) => b.push(i.fileName) });
    await vi.waitFor(() => expect(useUploadQueue.getState()._pumping).toBe(false));
    expect(log).toEqual(["A:a.txt", "B:b.txt"]);
    expect([a, b]).toEqual([["a.txt"], ["b.txt"]]);
  });
});
