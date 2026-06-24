import { describe, expect, it } from 'vitest';

import config from './wxt.config';

describe('extension manifest config', () => {
  it('keeps sandbox pages isolated from the extension origin', async () => {
    const manifestConfig = config.manifest;

    if (typeof manifestConfig === 'function') {
      throw new Error('Expected extension manifest config to be a static object');
    }

    const manifest = await Promise.resolve(manifestConfig);
    if (manifest === undefined) {
      throw new Error('Expected extension manifest config to be defined');
    }

    const sandboxCsp = manifest.content_security_policy?.sandbox;

    expect(sandboxCsp).toContain('sandbox');
    expect(sandboxCsp).not.toContain('allow-same-origin');
  });
});
