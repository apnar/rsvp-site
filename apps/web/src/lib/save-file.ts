/**
 * Hand the browser a file to save. The object URL outlives the click: some
 * browsers start the download after the handler returns, and a URL revoked
 * at once gives them an empty file.
 */
export function saveFile(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
