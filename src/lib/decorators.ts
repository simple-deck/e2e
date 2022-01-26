/* istanbul ignore file */
import { CoreSuite } from './base-suite';
import { SuiteRunnerStorage } from './suite-runner-storage';
import { FunctionKeys, SuiteArgs, SuiteConfig, Type } from './typings';

export function Step (order: number) {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return <T2 extends CoreSuite>(target: T2, prop: FunctionKeys<T2>) => {
    new SuiteRunnerStorage().registerStep(order, target, prop);
  };
}

export function Suite<T extends (readonly Type<CoreSuite>[])> (config: SuiteConfig<T>) {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return <T2 extends CoreSuite>(target: Type<CoreSuite>&{ new(...args: SuiteArgs<T>): T2; }) => {
    new SuiteRunnerStorage().registerSuite(config, target);
  };
}
