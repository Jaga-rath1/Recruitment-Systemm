const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false
  }
});
