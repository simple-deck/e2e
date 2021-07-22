import { BaseSuite } from './base-suite';

export enum Browsers {
  chromium = 'chromium', // Covers Chrome, Edge, Opera
  webkit = 'webkit', // Covers Safari
  firefox = 'firefox' // Covers Firefox
}

export type Type<T> = { new (...args: any[]): T }
export interface SuiteConfig<T extends (readonly Type<BaseSuite<any>>[])> {
  dependsOn: T;
  disabled?: boolean;
}

export interface SuiteStorage<T extends BaseSuite<unknown>, A extends unknown[]> {
  config: SuiteConfig<any>;
  suite: { new(...args: A): T; };
}

export interface SuccessRunResult<T> {
  success: true;
  result: T;
}

export interface FailRunResult {
  success: false;
  error: Error;
}

export type RunResult<T> = SuccessRunResult<T> | FailRunResult;

export type SuiteArgs<T> = {
  [P in keyof T]: T[P] extends Type<BaseSuite<infer R>> ? R : never;
};

export interface DataForSuiteWorker {
  browser: Browsers;
  suiteName: string;
  sharedData: SharedArrayBuffer;
  resultStorage: Map<string, unknown>;
}