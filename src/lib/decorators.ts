import { SuiteRunner } from './suite-runner';

export const Suite = SuiteRunner.Suite.bind(SuiteRunner);
export const Step: typeof SuiteRunner.Step = SuiteRunner.Step.bind(SuiteRunner);
