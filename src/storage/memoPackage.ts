import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import { sanitizeExportFileName } from '@/src/utils/format';
import { randomId } from '@/src/utils/id';

import {
  PROJECT_FILE_EXTENSION,
  PROJECT_MANIFEST_PATH,
  PROJECT_PACKAGE_META_PATH,
  buildExportableManifest,
  buildPackageMeta,
  encodeProjectJson,
  packagedMediaPath,
  validateProjectArchiveFromPaths,
  zipProjectFiles,
  type ValidatedProjectArchive,
} from './memoPackageFormat';
import { extractProjectArchiveToDirectory } from './projectArchiveExtract';
import { getMemoDir, requireLayerFile, resolveMemoDir } from './paths';
import type { Memo } from './types';
import { hasRecording } from './types';

export {
  PROJECT_FORMAT_ID,
  LEGACY_PROJECT_FORMAT_IDS,
  PROJECT_SCHEMA_VERSION,
  PROJECT_PACKAGE_META_PATH,
  PROJECT_MANIFEST_PATH,
  PROJECT_MEDIA_PREFIX,
  PROJECT_FILE_EXTENSION,
  LEGACY_PROJECT_FILE_EXTENSIONS,
  PROJECT_MIME_TYPE,
  LEGACY_PROJECT_MIME_TYPES,
  LEGACY_PROJECT_MIME_TYPE,
  PROJECT_UTI,
  isProjectFileName,
  buildExportableManifest,
  buildPackageMeta,
  mediaBasename,
  packagedMediaPath,
  remapImportedMemo,
  validateProjectArchive,
  zipProjectFiles,
  unzipProjectFiles,
  type MemoProjectPackageMeta,
  type ValidatedProjectArchive,
} from './memoPackageFormat';

function resolveAppVersion(explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }
  return Constants.expoConfig?.version ?? undefined;
}

function mapProjectImportError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/OutOfMemory|Failed to allocate/i.test(message)) {
    return new Error('This project is too large to import on this device.');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(message || 'Import failed.');
}

/** Best-effort delete of a stream-extract temp directory. */
export function cleanupProjectExtractDir(extractDirUri: string | undefined): void {
  if (!extractDirUri) {
    return;
  }
  try {
    const dir = new Directory(extractDirUri);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Best-effort cleanup.
  }
}

export async function writeImportedMemoFiles(
  memo: Memo,
  media: Map<string, string>
): Promise<void> {
  const destDir = getMemoDir(memo.id);
  if (!destDir.exists) {
    destDir.create({ intermediates: true, idempotent: true });
  }

  for (const layer of memo.layers) {
    if (layer.duration <= 0) {
      continue;
    }
    const mediaUri = media.get(layer.fileName);
    if (!mediaUri) {
      throw new Error(`Project package is missing media for “${layer.fileName}”.`);
    }
    const source = new File(mediaUri);
    if (!source.exists) {
      throw new Error(`Project package is missing media for “${layer.fileName}”.`);
    }
    const dest = new File(destDir, layer.fileName);
    if (dest.exists) {
      dest.delete();
    }
    await source.copy(dest, { overwrite: true });
  }

  const manifestFile = new File(destDir, 'manifest.json');
  if (!manifestFile.exists) {
    manifestFile.create();
  }
  manifestFile.write(JSON.stringify(memo, null, 2));
}

/** Pack a memo into a `.aud` project file in the cache directory. */
export async function packMemoToProjectFile(
  memo: Memo,
  options?: { appVersion?: string }
): Promise<File> {
  if (!hasRecording(memo)) {
    throw new Error('This memo has no recorded audio.');
  }

  const sourceDir = resolveMemoDir(memo.id);
  if (!sourceDir) {
    throw new Error('Memo not found');
  }

  const exportable = buildExportableManifest(memo);
  const meta = buildPackageMeta({ appVersion: resolveAppVersion(options?.appVersion) });
  const archiveFiles: Record<string, Uint8Array> = {
    [PROJECT_PACKAGE_META_PATH]: encodeProjectJson(meta),
    [PROJECT_MANIFEST_PATH]: encodeProjectJson(exportable),
  };

  for (const layer of memo.layers) {
    if (layer.duration <= 0) {
      continue;
    }
    const source = requireLayerFile(memo.id, layer.fileName);
    if (!source.exists) {
      throw new Error(`Missing audio file for “${layer.label || layer.fileName}”.`);
    }
    const bytes = await source.bytes();
    if (!bytes || bytes.byteLength === 0) {
      throw new Error(`Empty audio file for “${layer.label || layer.fileName}”.`);
    }
    archiveFiles[packagedMediaPath(layer.fileName)] = bytes;
  }

  const zipped = zipProjectFiles(archiveFiles);
  const baseName = sanitizeExportFileName(memo.title);
  const output = new File(Paths.cache, `${baseName}.${PROJECT_FILE_EXTENSION}`);
  if (output.exists) {
    output.delete();
  }
  output.create();
  output.write(zipped);
  return output;
}

function validateExtractedProjectDirectory(
  extractDir: Directory
): ValidatedProjectArchive {
  const metaFile = new File(extractDir, PROJECT_PACKAGE_META_PATH);
  const manifestFile = new File(extractDir, PROJECT_MANIFEST_PATH);
  if (!metaFile.exists) {
    throw new Error('Project package is missing package.json.');
  }
  if (!manifestFile.exists) {
    throw new Error('Project package is missing manifest.json.');
  }

  const metaJson = metaFile.textSync();
  const manifestJson = manifestFile.textSync();

  return validateProjectArchiveFromPaths(
    metaJson,
    manifestJson,
    (expectedPath, basename) => {
      const candidates = [
        new File(extractDir, ...expectedPath.split('/')),
        new File(extractDir, basename),
      ];
      for (const candidate of candidates) {
        if (candidate.exists && (candidate.size ?? 0) > 0) {
          return candidate.uri;
        }
      }
      return null;
    },
    extractDir.uri
  );
}

/** Parse and validate a project file URI into remappable contents (stream extract). */
export async function readProjectArchiveFromUri(
  uri: string
): Promise<ValidatedProjectArchive> {
  const extractDir = new Directory(Paths.cache, `import-extract-${randomId()}`);
  try {
    if (extractDir.exists) {
      extractDir.delete();
    }
    extractDir.create({ intermediates: true, idempotent: true });
    await extractProjectArchiveToDirectory(uri, extractDir);
    return validateExtractedProjectDirectory(extractDir);
  } catch (error) {
    cleanupProjectExtractDir(extractDir.uri);
    throw mapProjectImportError(error);
  }
}
