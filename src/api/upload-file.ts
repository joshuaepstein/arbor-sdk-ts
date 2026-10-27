export type UploadContents = string | Blob | ArrayBuffer | ArrayBufferView;

/** A file part for {@link HttpClient.uploadRequest} (PHP: `Arbor\Api\Gateway\UploadFile`). */
export class UploadFile {
  constructor(
    /** The form field name, e.g. `'file'`. */
    readonly name: string,
    readonly contents: UploadContents,
    readonly filename: string | null = null,
    /**
     * Per-part headers. `fetch`'s `FormData` can only carry a part's
     * `Content-Type`, so other headers are ignored.
     */
    readonly headers: Record<string, string> | null = null,
  ) {}

  /** @internal */
  toBlob(): Blob {
    const type =
      Object.entries(this.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ??
      (this.contents instanceof Blob ? this.contents.type : '');
    if (this.contents instanceof Blob && (!type || type === this.contents.type)) return this.contents;
    return new Blob([this.contents as BlobPart], type ? { type } : undefined);
  }
}
