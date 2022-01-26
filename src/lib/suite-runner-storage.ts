import { workerData } from 'worker_threads';
import { BaseSuite, CoreSuite } from './base-suite';
import { DataForSuiteWorker, FunctionKeys, StepError, SuiteArgs, SuiteConfig, SuiteStorage, TestResult, Type } from './typings';

/* tracks test suite configs */
const configStorage = new Map<string, SuiteStorage<CoreSuite, unknown[]>>();
/* tracks what test suites run based on this one */
const dependencyStorage = new Map<string, string[]>();
/* Suites with no depends on */
const rootSuites: string[] = [];

/* tracks the results of the test suites that have run */
const suiteResultStorage = new Map<string, TestResult<string>>();

const sharedSuiteStorage = new Map<string, boolean|string|number>();

/**
 * Responsible for validating and storing the configuration for the suites and results
 */
export class SuiteRunnerStorage {
  dataForSuiteWorker: DataForSuiteWorker = workerData;
  configStorage = configStorage;
  dependencyStorage = dependencyStorage;
  rootSuites = rootSuites;
  suiteResultStorage = suiteResultStorage;
  sharedSuiteStorage = sharedSuiteStorage;


  setConfig<T extends (readonly Type<CoreSuite>[])> (
    config: SuiteConfig<T>,
    target: Type<CoreSuite>&(new (...args: SuiteArgs<T>) => CoreSuite)
  ): void {
    const configStore: SuiteStorage<CoreSuite, unknown[]> = this.getConfigStore<T>(target);

    configStore.config = config;

    this.configStorage.set(target.name, configStore);
  }

  getConfigStore<T extends (readonly Type<CoreSuite>[])> (target: Type<CoreSuite>&(new (...args: SuiteArgs<T>) => CoreSuite)): SuiteStorage<CoreSuite, unknown[]> {
    return this.configStorage.get(target.name) ?? {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: null as any,
      suite: target,
      steps: {}
    };
  }

  setConfigStore (
    target: Type<CoreSuite>,
    store: SuiteStorage<CoreSuite, unknown[]>
  ): void {
    this.configStorage.set(target.name, store);
  }

  /**
   * Register a suite to be run
   * 
   * @param config The configuration for the step
   * @param target The class of the suite being registered
   */
  registerSuite<
    T extends (readonly Type<CoreSuite>[]),
    T2 extends CoreSuite
  > (
    config: SuiteConfig<T>,
    target: Type<CoreSuite>&{ new(...args: SuiteArgs<T>): T2; }
  ): void {
    if (config.disabled) {
      return;
    }
    if (this.configStorage.get(target.name)?.config) {
      throw new ReferenceError(`${target.name} is already registered, use a different name`);
    }
    this.setConfig<T>(config, target);

    if (config.dependsOn.length === 0) {
      this.rootSuites.push(target.name);
    }

    const loops = this.detectInfiniteLoops(target as Type<CoreSuite>);

    if (loops.length > 0) {
      console.error(loops.map(loop => loop.join(' => ')));

      throw new Error('Infinite loops detected');
    }

    const configStore = this.getConfigStore(target);

    if (!(target.prototype instanceof BaseSuite)) {
      const stepError = this.validateStepPresence(configStore.steps);

      if (stepError) {
        throw new Error(`Error validating steps for ${target.name}: ${stepError}`);
      }
    }

    config.dependsOn.forEach(dependent => {
      this.dependencyStorage.set(dependent.name, [
        ...(this.dependencyStorage.get(dependent.name) ?? []),
        target.name
      ]);
    });
  }

  /**
   * Register a step for a {@link CoreSuite}
   *
   * @param order Order which the step should run
   */
  registerStep<T2 extends CoreSuite> (order: number, target: T2, prop: FunctionKeys<T2>): void {
    const config = this.getConfigStore(target.constructor as Type<T2>) as SuiteStorage<T2, unknown[]>;

    if (order in config.steps) {
      throw new Error(`${order} already present on ${target.constructor.name}`);
    }

    config.steps[order] = prop;

    this.setConfigStore(target.constructor as Type<CoreSuite>, config as SuiteStorage<CoreSuite, unknown[]>);
  }

  private detectInfiniteLoops (core: Type<CoreSuite>): Type<CoreSuite>[][] {
    const infiniteLoops: Type<CoreSuite>[][] = [];
  
    const infiniteLoopLoop = (
      currentProp: Type<CoreSuite>,
      currentTree: Type<CoreSuite>[]
    ) => {
      const dependents = this.configStorage.get(currentProp.name)?.config.dependsOn ?? [];
  
      dependents.forEach((dependent: Type<CoreSuite>) => {
        const scopedCurrentTree = [
          ...currentTree,
          dependent
        ];
        const dependentDependsOnRoot = dependent === core;
        const partOfRelatedInfiniteLoop = currentTree.includes(dependent);
  
        if (dependentDependsOnRoot || partOfRelatedInfiniteLoop) {
          infiniteLoops.push(scopedCurrentTree);
        } else if (!partOfRelatedInfiniteLoop) {
          infiniteLoopLoop(
            dependent,
            scopedCurrentTree
          );
        }
      });
    };
  
    infiniteLoopLoop(core, [core]);
  
    return infiniteLoops;
  }

  /**
   * @param Suite The suite to be validated
   * 
   * @returns A string representing an error
   */
  private validateStepPresence (
    steps: Record<number, string>
  ): string {
    const keys = Object.keys(steps)
      .map(key => +key)
      .sort();

    if (keys.length === 0) {
      return StepError.noSteps;
    }

    let index = 0;

    // tracks which step a method was used for
    const methodUsageMap: Record<string, number> = {};

    for (const key of keys) {
      const currentStepMethod = steps[key];

      const onLastKey = !((index + 1) in keys);
      const nextKey = keys[index + 1];
      const desiredNextKey = key + 1;

      if (currentStepMethod in methodUsageMap) {
        return `${StepError.methodOnMultipleSteps}: ${currentStepMethod} (${key}, ${methodUsageMap[currentStepMethod]})`;
      }

      if (onLastKey) {
        continue;
      }

      if (desiredNextKey !== nextKey) {
        return `${StepError.missingStep}: ${desiredNextKey}`;
      }

      methodUsageMap[currentStepMethod] = key;
      ++index;
    }


    return '';
  }
}
