import { LaunchOptions } from 'playwright';
import { BaseSuite, CoreSuite } from './base-suite';

export enum Browsers {
  chromium = 'chromium', // Covers Chrome, Edge, Opera
  webkit = 'webkit', // Covers Safari
  firefox = 'firefox' // Covers Firefox
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Type<T> { new (...args: any[]): T }

export interface SuiteConfig<T extends (readonly Type<CoreSuite>[])> {
  /**
   * List of suites that this suite is dependent on. Results will be injected into the constructor in the same order
   */
  dependsOn: T;
  /**
   * Marks this suite as disabled. It will not run and suites that are dependent on this one will not run either
   */
  disabled?: boolean;
  /**
   * Suite level setting for whether screenshots should be taken. Overrides global setting in the {@link RunConfig}. See {@link RunConfig#screenshotBetweenStages}
   * 
   * Defaults to `false`
   */
  screenshotBetweenStages?: boolean;
  /**
   * Runs the suite in isolation (prevents other concurrent suites from running until this completes)
   */
  runInIsolation?: boolean;
}

export interface SuiteStorage<T extends CoreSuite, A extends unknown[]> {
  config: SuiteConfig<readonly (Type<CoreSuite>)[]>;
  steps: Record<number, FunctionKeys<T>>;
  suite: { new(...args: A): T; };
}

export interface SuccessRunResult<T> {
  success: true;
  result: T;
}

export interface FailRunResult {
  success: false;
  error: string;
}

export type RunResult<T> = SuccessRunResult<T> | FailRunResult;

export type SuiteArgs<T> = {
  [P in keyof T]: T[P] extends Type<BaseSuite<infer R>> ? R : T[P] extends Type<CoreSuite> ? PrimitiveMap<T[P]> : never;
};

export interface DataForSuiteWorker {
  browser: Browsers;
  suiteName: string;
  sharedData: SharedArrayBuffer;
  resultStorage: Map<string, SuccessRunResult<string>>;
}

export type PrimitiveKeys<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [P in keyof T]: T[P] extends string|number|boolean ? P : T[P] extends Function ? never : P;
}[keyof T];

export type PrimitiveMap<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly [P in PrimitiveKeys<T>]: T[P] extends object ? PrimitiveMap<T[P]> : T[P]
};


export type FunctionKeys<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [P in keyof T]: T[P] extends () => Promise<unknown>|unknown ? P extends string ? P : never : never;
}[keyof T];

export enum StepError {
  methodOnMultipleSteps = 'Method present for multiple steps',
  missingStep = 'Missing step',
  noSteps = 'No steps found'
}

export interface RunOptions {
  /**
   * Specify list of browsers to run
   */
  browsers: Browsers[];
  /**
   * glob style pattern matching files to be included
   */
  importFilePattern?: string;
  /**
   * Playwright options to pass as the launch config for each browser
   */
  launchOptions?: LaunchOptions;
  /**
   * Should each browser be opened in parallel
   * 
   * Defaults to `false`
   */
  runBrowsersInParallel?: boolean;
  /**
   * Global setting for whether each suite should produce screenshots
   * 
   * Defaults to `true`
   */
  screenshotBetweenStages?: boolean;
}
