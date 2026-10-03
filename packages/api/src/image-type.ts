export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * What the bytes actually are. An upload's declared type is whatever the
 * client said, and the objects are later served back with it, so the
 * content has to agree before anything is stored.
 */
export function sniffImage(bytes: ArrayBuffer): ImageType | null {
	const b = new Uint8Array(bytes.slice(0, 12));
	const at = (i: number, ...want: number[]) =>
		want.every((v, k) => b[i + k] === v);
	if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
	if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
	// "RIFF" <size> "WEBP"
	if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) {
		return "image/webp";
	}
	return null;
}
