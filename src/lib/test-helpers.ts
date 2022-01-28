/* istanbul ignore file */
import { BaseSuite } from './base-suite';
import { SuiteStorage, TestResult } from './typings';

export class SampleSuite extends BaseSuite<void> {
  hostname = '';
  main (): void { /* empty */ }
}
export const generateResult = (): TestResult<string> => ({
  result: '',
  specs: [],
  success: true,
  suiteName: SampleSuite.name,
  time: 0
});

export const generateConfig = (): SuiteStorage<any, any> => ({
  config: {
    dependsOn: []
  },
  steps: [],
  suite: SampleSuite
});
