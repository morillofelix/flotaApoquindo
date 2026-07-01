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

async function collectDirectoryFiles(
  directoryHandle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<File[]> {
  const files: File[] = [];

  for await (const [name, handle] of (
    directoryHandle as FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();

      files.push(
        new File([file], relativePath, {
          type: file.type,
          lastModified: file.lastModified,
        }),
      );
      continue;
    }

    if (handle.kind === "directory") {
      files.push(
        ...(await collectDirectoryFiles(
          handle as FileSystemDirectoryHandle,
          relativePath,
        )),
      );
    }
  }

  return files;
}

async function pickCompanionFilesFromDirectory() {
  if (!("showDirectoryPicker" in window)) {
    return null;
  }

  const directoryHandle = await (
    window as Window & {
      showDirectoryPicker: (options?: {
        mode?: "read" | "readwrite";
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker({
    mode: "read",
  });

  return collectDirectoryFiles(directoryHandle);
}

export type ResolveBulkUploadResult =
  | { kind: "files"; files: File[] }
  | { kind: "needs_directory"; selectedFile: File };

export async function resolvePreliquidacionesUploadFiles(
  selectedFile: File,
): Promise<ResolveBulkUploadResult> {
  const preview = await readFilePreview(selectedFile);

  if (!isPreliquidacionesFramesetPreview(preview)) {
    return { kind: "files", files: [selectedFile] };
  }

  if ("showDirectoryPicker" in window) {
    try {
      const companionFiles = await pickCompanionFilesFromDirectory();

      if (companionFiles && companionFiles.length > 0) {
        const selectedName = selectedFile.name.toLowerCase();

        if (
          !companionFiles.some(
            (file) => file.name.toLowerCase() === selectedName,
          )
        ) {
          return {
            kind: "files",
            files: [selectedFile, ...companionFiles],
          };
        }

        return { kind: "files", files: companionFiles };
      }
    } catch {
      // El usuario canceló el selector de carpeta.
    }
  } else {
    return { kind: "needs_directory", selectedFile };
  }

  return { kind: "files", files: [selectedFile] };
}

export function appendBulkUploadFiles(formData: FormData, files: File[]) {
  for (const file of files) {
    formData.append("file", file, file.name);
  }
}
