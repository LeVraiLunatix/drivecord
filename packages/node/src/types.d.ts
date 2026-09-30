export type NodeOptions = { token: string; driveKey: Uint8Array; baseUrl?: string };
export type ApiFile = { id: string; parentId: string; size: number; chunkCount: number; encMeta: string | null; fkWrapped: string | null; noncePrefix: string | null; trashed: boolean; createdAt: string };
export declare class DrivecordError extends Error { readonly status: number; readonly code?: string }
export declare class DrivecordNode {
  constructor(o: NodeOptions);
  me(): Promise<{ principal: unknown; drive: { encrypted: boolean } }>;
  upload(f: { name: string; type?: string; data: Uint8Array | Blob; parentId?: string }): Promise<{ fileId: string }>;
  list(opts?: { parentId?: string; cursor?: string; limit?: number }): Promise<{ files: (ApiFile & { name: string | null; type: string | null; plainSize: number })[]; nextCursor: string | null }>;
  download(fileId: string): Promise<{ name: string; type: string; data: Uint8Array }>;
  delete(fileId: string, opts?: { permanent?: boolean }): Promise<void>;
}
export default DrivecordNode;
