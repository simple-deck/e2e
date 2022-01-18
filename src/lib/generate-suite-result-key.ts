import { Browsers } from './typings';

export function generateSuiteResultKey (browser: Browsers, suiteName: string): string {
  return `${browser}-${suiteName}`;
}
