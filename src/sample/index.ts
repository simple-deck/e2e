import { Browsers, SuiteRunner } from '@simple-deck/e2e-runner';

SuiteRunner.run({
  browsers: [
    // Browsers.chromium,
    // Browsers.firefox,
    Browsers.webkit
  ],
  importFilePattern: './suites/**/*.js',
  launchOptions: {
    headless: false,
    timeout: 90000,
    slowMo: 100
  }
});
