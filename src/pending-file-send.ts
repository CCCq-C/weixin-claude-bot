import fs from "node:fs";
import path from "node:path";
import type { FileCandidate } from "./file-search.js";

export type PendingFileSend = {
  query: string;
  candidates: FileCandidate[];
  selectedIndex?: number;
  highRisk: boolean;
};

type StoredPendingFileSend = Omit<PendingFileSend, "candidates"> & {
  candidates: Array<Omit<FileCandidate, "modifiedAt"> & { modifiedAt: string }>;
  createdAt: string;
};

const EXPIRES_MS = 10 * 60 * 1000;

export function savePendingFileSend(
  dataDir: string,
  userId: string,
  pending: PendingFileSend,
  now = new Date(),
): void {
  const file = pendingFilePath(dataDir, userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const stored: StoredPendingFileSend = {
    ...pending,
    candidates: pending.candidates.map((candidate) => ({
      ...candidate,
      modifiedAt: candidate.modifiedAt.toISOString(),
    })),
    createdAt: now.toISOString(),
  };

  fs.writeFileSync(file, JSON.stringify(stored, null, 2), "utf-8");
}

export function readPendingFileSend(
  dataDir: string,
  userId: string,
  now = new Date(),
): PendingFileSend | null {
  const file = pendingFilePath(dataDir, userId);
  if (!fs.existsSync(file)) return null;

  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf-8")) as StoredPendingFileSend;
    const createdAt = new Date(stored.createdAt);
    if (!Number.isFinite(createdAt.getTime())) {
      clearPendingFileSend(dataDir, userId);
      return null;
    }
    if (now.getTime() - createdAt.getTime() > EXPIRES_MS) {
      clearPendingFileSend(dataDir, userId);
      return null;
    }

    return {
      query: stored.query,
      candidates: stored.candidates.map((candidate) => ({
        ...candidate,
        modifiedAt: new Date(candidate.modifiedAt),
      })),
      selectedIndex: stored.selectedIndex,
      highRisk: stored.highRisk,
    };
  } catch {
    clearPendingFileSend(dataDir, userId);
    return null;
  }
}

export function clearPendingFileSend(dataDir: string, userId: string): void {
  const file = pendingFilePath(dataDir, userId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function pendingFilePath(dataDir: string, userId: string): string {
  return path.join(dataDir, "pending-file-sends", `${safeFileName(userId)}.json`);
}

function safeFileName(value: string): string {
  return Buffer.from(value).toString("base64url");
}
