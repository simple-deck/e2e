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
   * 
   * @ignore used only for experiments DOES NOT WORK
   */
  runInIsolation?: boolean;
}

export interface SuiteStorage<T extends CoreSuite, A extends unknown[]> {
  config: SuiteConfig<readonly (Type<CoreSuite>)[]>;
  steps: Record<number, FunctionKeys<T>>;
  suite: { new(...args: A): T; };
}

export type SuiteArgs<T> = {
  [P in keyof T]: T[P] extends Type<BaseSuite<infer R>> ? R : T[P] extends Type<CoreSuite> ? PrimitiveMap<T[P]> : never;
};

export interface DataForSuiteWorker {
  browser: Browsers;
  suiteName: string;
  resultStorage: Map<string, TestResult<string>>;
  sharedStorage: Map<string, boolean|number|string>;
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

export enum TestResultsProcessor {
  JUnit
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
  /**
   * Specify how the test results will be outputted
   */
  testResults?: {
    processor: TestResultsProcessor;
    location: string
  };
  /**
   * Configuration for resuming tests after failures
   */
  autoResume?: AutoResumeOptions;
}

interface AutoResumeOptions {
  /**
   * If tests fail, when restarting, resume at the failed suite
   * 
   * Defaults to `false`
   */
  enabled: boolean;
  /**
   * File to store the successful test results
   */
  location: string;
}

interface BaseResult {
  specName: string;
  time: number;
}


export interface PassResult extends BaseResult {
  success: true;
}

export interface FailResult extends BaseResult {
  success: false;
  error: string;
}

export type SpecResult = (PassResult | FailResult);

export enum SuiteMessageType {
  FinalResult,
  UpdateSharedData
}

export interface SuiteResultMessage<T> {
  type: SuiteMessageType.FinalResult;
  result: TestResult<T>
}

export interface SuiteUpdateSharedDataMessage {
  type: SuiteMessageType.UpdateSharedData;
  value: string|number|boolean;
  key: string;
}

export interface TestResult<T> {
  suiteName: string;
  success: boolean;
  time: number;
  specs: SpecResult[];
  result: T;
}

export type SharedStorage<K extends string> = {
  [T in K]: string|boolean|number;
}

export const updateSharedDataEvent = 'updateValue';
