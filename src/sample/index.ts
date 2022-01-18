import { resolve } from 'path';
import { Browsers, SuiteRunner } from '../lib/';
import { Google } from './suites/google-core';
export { Google };

SuiteRunner.run({
  browsers: [
    Browsers.chromium,
    // Browsers.firefox,
    Browsers.webkit
  ],
  launchOptions: {
    headless: true,
    timeout: 90000
  },
  importFilePattern: './suites/**/*.js',
  screenshotBetweenStages: true,
  autoResume: {
    enabled: true,
    location: resolve(process.cwd(), 'cache')
  }
});
