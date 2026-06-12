export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    // Stub: overlay comparison is implemented in a later task.
  },
});
