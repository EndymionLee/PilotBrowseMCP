import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type FindingStatus = 'NEW' | 'SUSPECT' | 'VALIDATED' | 'CONFIRMED' | 'FIXED' | 'false_positive';

export const ALLOWED_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  NEW: ['SUSPECT', 'false_positive'],
  SUSPECT: ['VALIDATED', 'false_positive'],
  VALIDATED: ['CONFIRMED', 'false_positive'],
  CONFIRMED: ['FIXED'],
  FIXED: ['SUSPECT'],          // 重扫重新激活
  false_positive: ['SUSPECT'], // 翻案
};

export interface Validation {
  technique: string;
  confidence: string;
  evidence: Record<string, unknown>;
  at: string;
}

export interface Finding {
  id: string;
  status: FindingStatus;
  url: string;
  method: string;
  parameter: string;
  confidence: number;
  matchedRules: string[];
  firstSeen: string;
  lastSeen: string;
  validations: Validation[];
}

export function findingId(url: string, method: string, parameter: string): string {
  return createHash('sha1').update(`${url}|${method}|${parameter}`).digest('hex').slice(0, 16);
}

export interface UpsertInput {
  url: string; method: string; parameter: string;
  confidence: number; matchedRules: string[];
  status?: FindingStatus; validation?: Validation;
}

function assertTransition(from: FindingStatus, to: FindingStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) throw new Error(`Illegal transition ${from} -> ${to}`);
}

export class FindingStore {
  constructor(readonly dir: string) {}

  /** 写串行队列：load→改→save 原子执行，避免并发读改写丢更新/重复 validation */
  private writeQueue: Promise<void> = Promise.resolve();

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private file(): string { return path.join(this.dir, 'findings.json'); }

  async load(): Promise<Finding[]> {
    try {
      const raw = await fs.readFile(this.file(), 'utf-8');
      const parsed = JSON.parse(raw);
      const findings = Array.isArray(parsed) ? parsed : (parsed.findings ?? []);
      if (!Array.isArray(findings)) throw new Error('findings is not an array');
      return findings;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      try { await fs.rename(this.file(), this.file() + `.corrupt-${Date.now()}`); } catch {}
      return [];
    }
  }

  private async save(findings: Finding[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = this.file() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify({ findings }, null, 2), 'utf-8');
    await fs.rename(tmp, this.file());
  }

  upsert(input: UpsertInput): Promise<Finding> {
    return this.enqueue(async () => {
      const findings = await this.load();
      const id = findingId(input.url, input.method, input.parameter);
      const now = new Date().toISOString();
      const confidence = Math.min(1, Math.max(0, input.confidence));
      let f = findings.find((x) => x.id === id);
      if (f) {
        f.lastSeen = now;
        f.confidence = Math.max(f.confidence, confidence);
        f.matchedRules = [...new Set([...f.matchedRules, ...input.matchedRules])];
        if (input.validation && !f.validations.some((v) => v.technique === input.validation!.technique && JSON.stringify(v.evidence?.payload) === JSON.stringify(input.validation!.evidence?.payload))) {
          f.validations.push(input.validation);
        }
        if (input.status) { assertTransition(f.status, input.status); f.status = input.status; }
      } else {
        if (input.status && !(input.status in ALLOWED_TRANSITIONS)) throw new Error(`Invalid status: ${input.status}`);
        f = {
          id,
          status: input.status ?? 'SUSPECT',
          url: input.url,
          method: input.method,
          parameter: input.parameter,
          confidence,
          matchedRules: input.matchedRules,
          firstSeen: now,
          lastSeen: now,
          validations: input.validation ? [input.validation] : [],
        };
        findings.push(f);
      }
      await this.save(findings);
      return f;
    });
  }

  updateStatus(id: string, status: FindingStatus): Promise<Finding> {
    return this.enqueue(async () => {
      const findings = await this.load();
      const f = findings.find((x) => x.id === id);
      if (!f) throw new Error(`Finding not found: ${id}`);
      assertTransition(f.status, status);
      f.status = status;
      f.lastSeen = new Date().toISOString();
      await this.save(findings);
      return f;
    });
  }

  async list(status?: FindingStatus): Promise<Finding[]> {
    const findings = await this.load();
    return status ? findings.filter((f) => f.status === status) : findings;
  }

  async get(id: string): Promise<Finding | undefined> {
    const findings = await this.load();
    return findings.find((f) => f.id === id);
  }
}
