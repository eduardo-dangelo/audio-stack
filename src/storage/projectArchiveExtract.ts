import { Directory, File } from 'expo-file-system';
import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from 'fflate';

function normalizeArchivePath(path: string): string {
  return path.replace(/^\.?\//, '').replace(/\\/g, '/');
}

function isSafeArchivePath(path: string): boolean {
  if (!path || path.endsWith('/')) {
    return false;
  }
  const parts = path.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function writeUnzipFileToDisk(file: UnzipFile, outFile: File): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    try {
      outFile.parentDirectory.create({ intermediates: true, idempotent: true });
      if (outFile.exists) {
        outFile.delete();
      }
      outFile.create();
    } catch (error) {
      fail(error);
      return;
    }

    const writer = outFile.writableStream().getWriter();
    let writeChain: Promise<void> = Promise.resolve();

    file.ondata = (error, chunk, final) => {
      if (error) {
        writeChain = writeChain.catch(() => undefined).then(() => {
          fail(error);
        });
        return;
      }

      writeChain = writeChain
        .then(async () => {
          if (chunk && chunk.byteLength > 0) {
            await writer.write(chunk);
          }
          if (final) {
            await writer.close();
            done();
          }
        })
        .catch((writeError) => {
          fail(writeError);
        });
    };

    try {
      file.start();
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Stream-unzip a project archive into `destDir` without loading the whole zip into JS memory.
 */
export async function extractProjectArchiveToDirectory(
  sourceUri: string,
  destDir: Directory
): Promise<void> {
  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error('Selected file could not be read.');
  }

  if (!destDir.exists) {
    destDir.create({ intermediates: true, idempotent: true });
  }

  const fileWrites: Promise<void>[] = [];
  let unzipError: Error | null = null;

  const unzipper = new Unzip((file) => {
    if (unzipError) {
      return;
    }

    const normalized = normalizeArchivePath(file.name);
    if (!isSafeArchivePath(normalized)) {
      return;
    }

    const segments = normalized.split('/');
    const outFile = new File(destDir, ...segments);
    fileWrites.push(
      writeUnzipFileToDisk(file, outFile).catch((error) => {
        unzipError =
          error instanceof Error ? error : new Error(String(error));
        throw unzipError;
      })
    );
  });

  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);

  try {
    const reader = source.readableStream().getReader();
    while (true) {
      if (unzipError) {
        throw unzipError;
      }
      const { done, value } = await reader.read();
      if (done) {
        unzipper.push(new Uint8Array(0), true);
        break;
      }
      if (value && value.byteLength > 0) {
        unzipper.push(value);
      }
    }
  } catch (error) {
    if (unzipError) {
      throw unzipError;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/OutOfMemory|Failed to allocate/i.test(message)) {
      throw new Error('This project is too large to import on this device.');
    }
    throw new Error('This file is not a valid project archive.');
  }

  try {
    await Promise.all(fileWrites);
  } catch (error) {
    if (unzipError) {
      throw unzipError;
    }
    throw error;
  }

  if (unzipError) {
    throw unzipError;
  }
}
