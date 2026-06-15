import { describe, expect, it } from 'vitest';
import { RELAY_RPC_METHODS } from './protocol.js';
// Import the EXTENSION's source-of-truth list directly so this assertion can
// never go stale: if the extension adds/removes an RPC method without updating
// the relay's mirror (RELAY_RPC_METHODS in ./protocol.ts), this test fails.
// (Type-only imports inside messages.ts are stripped, so pulling it in here does
// not drag any WXT/DOM runtime into the node test.)
import { RPC_METHODS } from '../../extension/src/lib/messages';

describe('relay/extension RPC method parity', () => {
  it('mirrors the extension RPC_METHODS exactly (no drift)', () => {
    const relay = [...RELAY_RPC_METHODS].sort();
    const extension = [...RPC_METHODS].sort();

    const missingFromRelay = extension.filter((m) => !relay.includes(m as never));
    const extraInRelay = relay.filter((m) => !extension.includes(m as never));

    expect(missingFromRelay, 'methods in extension but missing from relay').toEqual([]);
    expect(extraInRelay, 'methods in relay but not in extension').toEqual([]);
    expect(relay).toEqual(extension);
  });

  it('has no duplicate method names in the relay list', () => {
    expect(new Set(RELAY_RPC_METHODS).size).toBe(RELAY_RPC_METHODS.length);
  });
});
