#!/usr/bin/env python3
"""Run from repository root: python3 apply_patch.py
Safely patches existing source files in place; creates .before-research-auth backups.
"""
from pathlib import Path
import re
root=Path.cwd()

def patch(rel, fn):
    path=root/rel
    if not path.exists():
        raise SystemExit(f"Missing {rel}; run from repository root or inspect paths.")
    old=path.read_text()
    new=fn(old)
    if new==old:
        print(f"Already patched: {rel}");return
    backup=path.with_name(path.name+'.before-research-auth')
    if not backup.exists():backup.write_text(old)
    path.write_text(new)
    print(f"Patched {rel} (backup: {backup.name})")

helper=root/'client/src/services/researchAuth.js'
helper.parent.mkdir(parents=True,exist_ok=True)
if not helper.exists():helper.write_text((Path(__file__).parent/'client/src/services/researchAuth.js').read_text())

def stock(s):
    imp='import { researchAuthHeaders, isProtectedResearchPath } from "./researchAuth.js";\n'
    if 'from "./researchAuth.js"' in s:return s
    needle='export async function apiFetch('
    if s.count(needle)!=1:raise SystemExit('Unexpected api.js: apiFetch signature not found uniquely')
    s=imp+s
    # Header acquisition happens inside try to retain existing timeout cleanup.
    pattern=r'(\btry\s*\{\s*const response\s*=\s*await fetch\(\s*endpoint,\s*\{\s*method,\s*headers:\s*\{)'
    if len(re.findall(pattern,s))!=1:raise SystemExit('Unexpected api.js fetch block; no changes saved')
    s=re.sub(pattern,lambda m:m.group(1).replace('headers: {','headers: {\n          ...(isProtectedResearchPath(path) ? Object.fromEntries((await researchAuthHeaders(headers)).entries()) : {}),'),s,count=1)
    return s

def crypto(s):
    imp='import { researchAuthHeaders } from "./researchAuth.js";\n'
    if 'from "./researchAuth.js"' in s:return s
    if not re.search(r'async function request\(path, options\s*=\s*\{\}\)',s):raise SystemExit('Unexpected cryptoApi.js request signature')
    # Insert before fetch in request only, preserve all existing exports and private runtime methods.
    start=s.index('async function request(')
    fetch=s.index('fetch(',start)
    s=imp+s
    start=s.index('async function request(');fetch=s.index('fetch(',start)
    # Insert token into options headers for research-only crypto paths. Avoid touching bot/runtime requests.
    pattern=r'(async function request\(path, options\s*=\s*\{\}\)\s*\{)'
    s=re.sub(pattern,lambda m:m.group(1)+"""\n  const protectedPath = /^\/research(?:\/|$)/.test(path);
  const authHeaders = protectedPath ? await researchAuthHeaders(options.headers ?? {}) : (options.headers ?? {});
""",s,count=1)
    # Both supported source versions have options.headers inside request, but may order spreads differently.
    start=s.index('async function request(');end=s.index('let body',start) if 'let body' in s[start:] else s.index('try {',start)
    section=s[start:end]
    if '...(options.headers ?? {})' not in section:raise SystemExit('Crypto request headers shape differs; no changes saved')
    section=section.replace('...(options.headers ?? {})','...authHeaders')
    s=s[:start]+section+s[end:]
    return s

def crypto_research(s):
    imp='import { researchAuthHeaders } from "../../services/researchAuth.js";\n'
    if 'from "../../services/researchAuth.js"' in s:return s
    if 'async function requestResearch(' not in s or 'async function requestExchangeIntelligence(' not in s:raise SystemExit('Unexpected CryptoResearch.jsx functions')
    s=imp+s
    a=s.index('async function requestResearch(');b=s.index('async function requestExchangeIntelligence(',a)
    chunk=s[a:b]
    if 'headers: { "Content-Type": "application/json" }' not in chunk:raise SystemExit('Unexpected requestResearch headers')
    chunk=chunk.replace('headers: { "Content-Type": "application/json" }','headers: await researchAuthHeaders({ "Content-Type": "application/json" })',1)
    s=s[:a]+chunk+s[b:]
    a=s.index('async function requestExchangeIntelligence(');b=s.index('function ScoreRing(',a)
    chunk=s[a:b]
    if '{ signal }' not in chunk:raise SystemExit('Unexpected exchange-intelligence options')
    chunk=chunk.replace('{ signal }','{ signal, headers: await researchAuthHeaders() }',1)
    s=s[:a]+chunk+s[b:]
    return s

patch('client/src/services/api.js',stock)
patch('client/src/crypto/services/cryptoApi.js',crypto)
patch('client/src/crypto/pages/CryptoResearch.jsx',crypto_research)
print('Done. Test login, stock research, crypto research, trial expiry, and bot isolation before deploying.')
