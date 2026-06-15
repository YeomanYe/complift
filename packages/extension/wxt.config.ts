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
      {
        // For the overlay-on-page path, sandbox.html is embedded as an iframe
        // in an arbitrary host page (opaque origin), so every resource it
        // sub-fetches must be web-accessible: the document itself, the module
        // chunk it loads via <script src="/chunks/sandbox-*.js">, and the
        // esbuild wasm binary that chunk fetches to initialize the compiler.
        resources: ['sandbox.html', 'chunks/sandbox-*.js', 'esbuild.wasm'],
        matches: ['<all_urls>'],
      },
    ],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'complift' },
  },
});
