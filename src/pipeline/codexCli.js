import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { strictJsonFromText } from '../utils.js';

export function buildCodexCliPrompt({ system, user }) {
  return [
    system,
    '',
    'You are running inside Codex CLI as a decision-only adapter for Charon.',
    'Return strict JSON only. No markdown unless it is a single JSON code fence.',
    'Do not edit files. Do not run commands. Do not inspect the repository. Do not ask questions.',
    'Do not include chain-of-thought. Use only the candidate data below.',
    '',
    'Required JSON schema:',
    JSON.stringify(user.output_schema || {
      verdict: 'BUY|WATCH|PASS',
      selected_candidate_id: 'integer candidate_id when verdict is BUY, otherwise null',
      selected_mint: 'mint string when verdict is BUY, otherwise null',
      confidence: 'number 0-100',
      reason: 'short string',
      risks: ['short strings'],
      suggested_tp_percent: 'positive number',
      suggested_sl_percent: 'negative number',
    }, null, 2),
    '',
    'Decision input JSON:',
    JSON.stringify(user),
  ].join('\n');
}

const CODEX_CLI_FALLBACK_DIRS = [
  '/home/ubuntu/.hermes/node/bin',
  '/home/ubuntu/.local/bin',
  '/usr/local/bin',
  '/usr/bin',
];

function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildCodexCliEnv(env = process.env) {
  const pathParts = String(env.PATH || '').split(delimiter).filter(Boolean);
  const mergedPath = [...new Set([...pathParts, ...CODEX_CLI_FALLBACK_DIRS])].join(delimiter);
  return {
    ...env,
    PATH: mergedPath,
    // Keep Codex non-interactive where supported by the installed CLI.
    CI: env.CI || '1',
  };
}

export function resolveCodexCliCommand(command = process.env.CODEX_CLI_COMMAND || 'codex', env = process.env) {
  if (!command || command.includes('/')) return command;
  const pathParts = String(env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of [...pathParts, ...CODEX_CLI_FALLBACK_DIRS]) {
    const candidate = join(dir, command);
    if (isExecutable(candidate)) return candidate;
  }
  return command;
}

export function runCodexExec(prompt, {
  command = process.env.CODEX_CLI_COMMAND || 'codex',
  args = process.env.CODEX_CLI_ARGS ? process.env.CODEX_CLI_ARGS.split(/\s+/).filter(Boolean) : ['exec'],
  timeoutMs = Number(process.env.CODEX_CLI_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 45_000),
  cwd = process.cwd(),
} = {}) {
  return new Promise((resolve) => {
    const resolvedCommand = resolveCodexCliCommand(command, process.env);
    const childEnv = buildCodexCliEnv(process.env);
    if (resolvedCommand?.includes('/')) {
      childEnv.PATH = [dirname(resolvedCommand), childEnv.PATH].filter(Boolean).join(delimiter);
    }
    const child = spawn(resolvedCommand, [...args, prompt], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000).unref?.();
      finish({ stdout, stderr, exitCode: null, timedOut: true });
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => finish({ stdout, stderr: `${stderr}${error.message}`, exitCode: null, error }));
    child.on('close', code => finish({ stdout, stderr, exitCode: code, timedOut: false }));
  });
}

function fallbackDecision(message) {
  return {
    verdict: 'WATCH',
    confidence: 0,
    selected_candidate_id: null,
    selected_mint: null,
    selected_row: null,
    reason: `Codex CLI failed: ${message}`.slice(0, 1000),
    risks: ['codex_cli_error'],
    suggested_tp_percent: 50,
    suggested_sl_percent: -25,
    raw: { error: message },
  };
}

export function shouldSuppressCodexFailureNotification(decision) {
  return Array.isArray(decision?.risks) && decision.risks.includes('codex_cli_error');
}

export async function decideWithCodexCli({
  rows,
  system,
  user,
  normalizeDecision,
  runner = runCodexExec,
  timeoutMs = Number(process.env.CODEX_CLI_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 45_000),
  cwd = process.cwd(),
} = {}) {
  const prompt = buildCodexCliPrompt({ system, user });
  try {
    const result = await runner(prompt, { timeoutMs, cwd });
    if (result?.timedOut) return fallbackDecision(`timeout after ${timeoutMs}ms`);
    if (result?.exitCode !== 0) {
      const detail = String(result?.stderr || result?.stdout || `exit ${result?.exitCode}`).trim();
      return fallbackDecision(detail || `exit ${result?.exitCode}`);
    }

    const parsed = strictJsonFromText(result?.stdout || '');
    const decision = normalizeDecision(parsed);
    const selectedId = Number(parsed.selected_candidate_id);
    const selectedMint = String(parsed.selected_mint || '');
    const row = rows.find(item => item.id === selectedId || item.candidate.token?.mint === selectedMint);
    return {
      ...decision,
      selected_candidate_id: decision.verdict === 'BUY' && row ? row.id : null,
      selected_mint: decision.verdict === 'BUY' && row ? row.candidate.token.mint : null,
      selected_row: decision.verdict === 'BUY' && row ? row : null,
    };
  } catch (err) {
    return fallbackDecision(err.message);
  }
}
