import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

export const STORAGE = {
  root: path.join(ROOT, "storage"),
  input: path.join(ROOT, "storage", "input"),
  audio: path.join(ROOT, "storage", "audio"),
  scenes: path.join(ROOT, "storage", "scenes"),
  output: path.join(ROOT, "storage", "output"),
} as const;

export async function ensureStorageDirs(): Promise<void> {
  await fs.mkdir(STORAGE.input, { recursive: true });
  await fs.mkdir(STORAGE.audio, { recursive: true });
  await fs.mkdir(STORAGE.scenes, { recursive: true });
  await fs.mkdir(STORAGE.output, { recursive: true });
}

export function jobInputDir(jobId: string) {
  return path.join(STORAGE.input, jobId);
}

export function jobAudioDir(jobId: string) {
  return path.join(STORAGE.audio, jobId);
}

export function jobScenesDir(jobId: string) {
  return path.join(STORAGE.scenes, jobId);
}

export function jobOutputDir(jobId: string) {
  return path.join(STORAGE.output, jobId);
}

export async function ensureJobDirs(jobId: string): Promise<void> {
  await fs.mkdir(jobInputDir(jobId), { recursive: true });
  await fs.mkdir(jobAudioDir(jobId), { recursive: true });
  await fs.mkdir(jobScenesDir(jobId), { recursive: true });
  await fs.mkdir(jobOutputDir(jobId), { recursive: true });
}
