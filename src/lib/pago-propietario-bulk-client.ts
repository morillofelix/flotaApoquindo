export function isPreliquidacionesFramesetPreview(content: string) {
  const lower = content.toLowerCase();

  return (
    lower.includes("<frameset") &&
    (lower.includes("worksheetsource") ||
      lower.includes(".files/") ||
      lower.includes("sheet001.htm"))
  );
}

async function readFilePreview(file: File) {
  const slice = file.slice(0, 48_000);

  try {
    return await slice.text();
  } catch {
    return "";
  }
}

export type ResolveBulkUploadResult =
  | { kind: "files"; files: File[] }
  | { kind: "needs_directory"; selectedFile: File; reason: "frameset" };

export async function resolvePreliquidacionesUploadFiles(
  selectedFile: File,
): Promise<ResolveBulkUploadResult> {
  const preview = await readFilePreview(selectedFile);

  if (!isPreliquidacionesFramesetPreview(preview)) {
    return { kind: "files", files: [selectedFile] };
  }

  return { kind: "needs_directory", selectedFile, reason: "frameset" };
}

export function getBulkUploadFileName(file: File) {
  if ("webkitRelativePath" in file && file.webkitRelativePath) {
    return file.webkitRelativePath;
  }

  return file.name;
}

export function collectBulkUploadFiles(
  selectedFile: File,
  directoryFiles: File[],
) {
  const selectedName = selectedFile.name.toLowerCase();
  const hasSelectedFile = directoryFiles.some((entry) => {
    const uploadName = getBulkUploadFileName(entry).toLowerCase();

    return (
      uploadName === selectedName || uploadName.endsWith(`/${selectedName}`)
    );
  });

  return hasSelectedFile
    ? directoryFiles
    : [selectedFile, ...directoryFiles];
}

export function appendBulkUploadFiles(formData: FormData, files: File[]) {
  for (const file of files) {
    formData.append("file", file, getBulkUploadFileName(file));
  }
}
