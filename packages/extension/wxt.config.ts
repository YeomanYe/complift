import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'complift',
    permissions: ['sidePanel', 'storage', 'scripting', 'activeTab', 'tabs'],
    host_permissions: ['<all_urls>'],
    sandbox: { pages: ['sandbox.html'] },
    content_security_policy: {
      sandbox:
        "sandbox allow-scripts allow-same-origin; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [
      { resources: ['sandbox.html', 'sandbox/*'], matches: ['<all_urls>'] },
    ],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'complift' },
  },
});
