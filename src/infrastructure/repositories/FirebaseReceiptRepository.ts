import { collection, doc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { FirebaseStorage } from "firebase/storage";
import { ReceiptUploadError } from "../../domain/repositories/ReceiptRepository";
import type { ReceiptFile, ReceiptRepository, UploadedReceipt } from "../../domain/repositories/ReceiptRepository";

export class FirebaseReceiptRepository implements ReceiptRepository {
  // Track only uploads created by this instance, never arbitrary existing URLs.
  private readonly newUploads = new Set<string>();

  constructor(private readonly storage: FirebaseStorage, private readonly db: Firestore) {}

  async upload(userId: string, file: ReceiptFile): Promise<UploadedReceipt> {
    if (!userId) throw new Error("Entre na sua conta para enviar o comprovante.");
    // Firestore's random document IDs need no write and avoid filename collisions.
    const id = doc(collection(this.db, "users", userId, "transactions")).id;
    const path = `users/${userId}/receipts/${id}`;
    const target = ref(this.storage, path);
    let uploaded = false;
    try {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      try {
        await uploadBytes(target, blob, {
          contentType: receiptContentType(file, blob.type),
          contentDisposition: "inline",
        });
        uploaded = true;
        this.newUploads.add(path);
      } finally {
        // Releasing a local blob must not replace the upload result/error.
        try { (blob as Blob & { close?: () => void }).close?.(); }
        catch { /* No remote data is changed by local resource cleanup. */ }
      }
      const url = await getDownloadURL(target);
      // The caller now owns this handle; it is used only before association.
      return { path, url };
    } catch (error) {
      let cleanupFailed = false;
      // After URL failure, no transaction write has even been attempted.
      if (uploaded) {
        try { await this.removeNewUpload(userId, { path, url: "" }); }
        catch { cleanupFailed = true; }
      }
      throw new ReceiptUploadError(error, cleanupFailed);
    }
  }

  releaseUpload(receipt: UploadedReceipt): void {
    this.newUploads.delete(receipt.path);
  }

  async removeNewUpload(userId: string, receipt: UploadedReceipt): Promise<void> {
    if (!userId || !receipt.path.startsWith(`users/${userId}/receipts/`) || !this.newUploads.has(receipt.path)) {
      throw new Error("Não é permitido remover este comprovante.");
    }
    // Consume the deletion capability once. A retry cannot later delete a file
    // that might have become associated with a successful transaction.
    this.newUploads.delete(receipt.path);
    await deleteObject(ref(this.storage, receipt.path));
  }
}

function receiptContentType(file: ReceiptFile, blobType?: string): string {
  const extensions = new Map([
    ["pdf", "application/pdf"], ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"], ["png", "image/png"],
  ]);
  const name = file.name?.trim() || file.uri.split(/[?#]/)[0];
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;
  // Picker metadata is preferred; generic/invalid MIME values must not hide
  // a known extension or a specific Blob type. Unknown files stay generic.
  return specificMimeType(file.mimeType) ||
    (extension ? extensions.get(extension) : undefined) ||
    specificMimeType(blobType) || "application/octet-stream";
}

function specificMimeType(value?: string): string | undefined {
  const mime = value?.split(";")[0].trim().toLowerCase();
  if (!mime || !/^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(mime) ||
    ["application/octet-stream", "binary/octet-stream", "application/unknown", "application/x-unknown", "unknown/unknown"].includes(mime)) {
    return undefined;
  }
  return mime;
}
