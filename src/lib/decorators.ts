import { BaseSuite } from './base-suite';
import { SuiteRunner } from './suite-runner';
import { SuiteConfig, Type } from './typings';

export function Suite <T extends (readonly Type<BaseSuite<any>>[])>(config: SuiteConfig<T>) {
  return SuiteRunner.Suite(config);
}
