export type InitOptions = { clientId: string; redirectUri: string; baseUrl?: string; scopes?: string[] };
export type UploaderOptions = {
  multiple?: boolean;
  accept?: string;
  onReady?: () => void;
  onProgress?: (p: { fileId: string; percent: number }) => void;
  onUploaded?: (f: { fileId: string; size: number }) => void;
  onError?: (code: string) => void;
};
export type Mounted = { destroy(): void; iframe: HTMLIFrameElement };
export declare class Drivecord {
  static init(o: InitOptions): Drivecord;
  static completeSignIn(): void;
  readonly signedIn: boolean;
  signIn(): Promise<void>;
  signOut(): void;
  api<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  mountUploader(el: HTMLElement, o?: UploaderOptions): Mounted;
  mountViewer(el: HTMLElement, o: { fileId: string; onError?: (code: string) => void }): Mounted;
}
export default Drivecord;
