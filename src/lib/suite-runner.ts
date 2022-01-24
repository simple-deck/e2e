import { sync } from 'glob';
import { isMainThread, Worker, workerData } from 'worker_threads';
import { BaseSuite, CoreSuite } from './base-suite';
import { CachedMap } from './cached-map';
import { generateSuiteResultKey } from './generate-suite-result-key';
import { ResultsProcessor } from './results-processor';
import { SuiteRunnerWorker } from './suite-runner-worker';
import { Browsers, DataForSuiteWorker, FailResult, FunctionKeys, RunOptions, StepError, SuiteArgs, SuiteConfig, SuiteStorage, TestResult, Type } from './typings';
const dataForSuiteWorker: DataForSuiteWorker = workerData;

/* tracks test suite configs */
const configStorage = new Map<string, SuiteStorage<CoreSuite, unknown[]>>();
/* tracks what test suites run based on this one */
const dependencyStorage = new Map<string, string[]>();
/* Suites with no depends on */
const rootSuites: string[] = [];

/* tracks the results of the test suites that have run */
const suiteResultStorage = new Map<string, TestResult<string>>();

export class SuiteRunner {
  private static configStorage = configStorage;
  private static dependencyStorage = dependencyStorage;
  private static rootSuites = rootSuites;
  private static suiteResultStorage = suiteResultStorage;


  static setSuiteResult (browserName: Browsers, suiteName: string, result: TestResult<string>): void {
    this.suiteResultStorage.set(generateSuiteResultKey(browserName, suiteName), result);
  }

  static getSuiteResult (browserName: Browsers, suiteName: string): TestResult<string>|undefined {
    return this.suiteResultStorage.get(generateSuiteResultKey(browserName, suiteName));
  }

  private sharedData = new SharedArrayBuffer(256 * 1024);

  /**
   * Looks for a configuration for a suite and throws an error if none exist
   *
   * @param suite Name of the suite to look up
   * @returns The configuration of the suite
   */
  private getSuiteConfig (suite: string) {
    const config = SuiteRunner.configStorage.get(suite);

    if (!config) {
      throw new ReferenceError(`Could not determine configuration for test suite (${suite}), did you decorate your class?`);
    }

    return config;
  }

  /**
   * Looks up the suite, spawns a worker, and stores the result for future suties
   *
   * @param suiteName Name of the suite to run
   * @param browser Browser to run the suite in
   */
  private async runSuiteInMain (
    suiteName: string,
    browser: Browsers
  ): Promise<void> {
    console.log('running ', suiteName, ' in ', browser);
    const result = await this.awaitWorker(suiteName, browser);

    SuiteRunner.setSuiteResult(browser, suiteName, result);

    const triggeredSuites = SuiteRunner.dependencyStorage.get(suiteName) ?? [];
    const readySuites = triggeredSuites.filter((triggeredSuite) => {
      const dependentSuites = this.getSuiteConfig(triggeredSuite).config.dependsOn;

      const shouldRunSuite = dependentSuites.every((suite: Type<CoreSuite>) => {
        return SuiteRunner.getSuiteResult(browser, suite.name)?.success ?? false;
      });

      return shouldRunSuite;
    });

    const [isolatedSuites, concurrentSuites] = this.determineIsolatedSuites(readySuites);
    await this.executeSuitesInOrder(isolatedSuites, browser, concurrentSuites);
  }

  private async executeSuitesInOrder (isolatedSuites: string[], browser: Browsers, concurrentSuites: string[]) {
    for (const isolatedSuite of isolatedSuites) {
      await this.runSuiteInMain(isolatedSuite, browser);
    }

    await Promise.all(concurrentSuites.map((triggeredSuite) => {
      return this.runSuiteInMain(triggeredSuite, browser);
    }));
  }

  /**
   * 
   * @param suites array of suite names
   * @returns tuple of [isolatedSuites and concurrentSuites]
   */
  private determineIsolatedSuites (suites: string[]): [string[], string[]] {
    return suites.reduce<[string[], string[]]>((acc, suite) => {
      const conf = this.getSuiteConfig(suite);

      if (conf.config.runInIsolation === false && process.env.SD_EXPERIMENTAL_CONCURRENCY === 'enabled') {
        return [
          [
            ...acc[0]
          ],
          [
            ...acc[1],
            suite
          ]
        ];
      } else {
        return [
          [
            ...acc[0],
            suite
          ],
          [
            ...acc[1]
          ]
        ];
      }
    }, [[], []]);
  }

  private createWorker (data: DataForSuiteWorker) {
    return new Worker(require.main?.filename ?? __filename, {
      workerData: data
    });
  }

  private async awaitWorker (
    suiteName: string,
    browser: Browsers
  ) {
    const workerName = `worker for ${suiteName} on ${browser}`;
    const existingResult = SuiteRunner.getSuiteResult(browser, suiteName);
    if (existingResult?.success) {
      console.log(`skipping: ${workerName}`);

      return existingResult;
    }

    console.log(`spawning:`, workerName);

    return new Promise<TestResult<string>>((res, rej) => {
      const worker = this.createWorker({
        sharedData: this.sharedData,
        suiteName,
        browser,
        resultStorage: SuiteRunner.suiteResultStorage
      });
  
      worker.on('message', async (result: TestResult<string>) => {
        if (result.success) {
          console.log(workerName, `succeeded with`, result);
          res(result);
        } else if (result.success === false) {
          const errorSpec = result.specs.find(spec => spec.success === false) as FailResult;
          // console.log(workerName, 'failed with', result.error);
          rej(errorSpec?.error);
        }
        SuiteRunner.setSuiteResult(browser, suiteName, result);
      });
      
      worker.on('error', (err) => {
        console.log(workerName, 'failed with', err);
        rej(err);
      });
    });
  }


  private async runInMain (browser: Browsers): Promise<boolean> {
    const start = Date.now();
    
    const [isolatedSuites, concurrentSuites] = this.determineIsolatedSuites(SuiteRunner.rootSuites);
    try {
      await this.executeSuitesInOrder(isolatedSuites, browser, concurrentSuites);
    } catch (e) {
      console.error(`${browser} failed with ${e}`);

      return false;
    }
    console.log('All tests finished in: ', Date.now() - start);

    return true;
  }

  static async run (options: RunOptions): Promise<void> {
    const {
      importFilePattern,
      browsers = [],
      launchOptions = {
        headless: true
      },
      runBrowsersInParallel = false,
      screenshotBetweenStages = true,
      autoResume = {
        enabled: false,
        location: ''
      },
    } = options;

    const conf = {
      importFilePattern,
      browsers,
      launchOptions,
      runBrowsersInParallel,
      screenshotBetweenStages
    };

    if (autoResume.enabled) {
      SuiteRunner.suiteResultStorage = new CachedMap(autoResume.location);
    }

    const suiteRunner = new SuiteRunner();

    if (importFilePattern) {
      this.importSuites(importFilePattern);
    }

    if (isMainThread) {
      let allPassed = true;
      const start = Date.now();
      if (runBrowsersInParallel) {
        await Promise.all(browsers.map(async (browser) => {
          const thisPassed = await suiteRunner.runInMain(browser);
          if (!thisPassed) {
            allPassed = false;
          }
        }));
      } else {
        for (const browser of browsers) {
          const thisPassed = await suiteRunner.runInMain(browser);

          if (!thisPassed) {
            allPassed = false;
          }
        }
      }

      if (allPassed) {
        SuiteRunner.suiteResultStorage.clear();
      }

      const allResults = [...SuiteRunner.suiteResultStorage.values()];

      if (options.testResults) {
        const processor = new ResultsProcessor();
        await processor.writeResults(
          options.testResults.processor,
          allResults,
          Date.now() - start,
          options.testResults.location
        );
      }

      if (!allPassed) {
        process.exit(1);
      }
    } else {
      const suiteRunnerWorker = new SuiteRunnerWorker(
        suiteRunner.getSuiteConfig(dataForSuiteWorker.suiteName),
        conf  
      );

      await suiteRunnerWorker.runSuiteInWorker();
    }
  }

  private static importSuites (
    filePattern: string
  ) {
    const root = require.main?.path + '/';
    // glob search from current working directory
    const matchedFiles = sync(filePattern, {
      cwd: root,
      absolute: true
    });

    if (isMainThread) {
      console.log('matched', matchedFiles, 'for', filePattern, 'relative to', root);
    }

    // remove file extension
    const importPaths = matchedFiles.map(file => {
      return file.split('.').slice(0, -1).join('.');
    });

    // `require` each file
    importPaths.forEach(path => require(path));
  }

  static Suite<T extends (readonly Type<CoreSuite>[])> (config: SuiteConfig<T>) {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    return <T2 extends CoreSuite>(target: Type<CoreSuite>&{ new(...args: SuiteArgs<T>): T2; }) => {
      if (config.disabled) {
        return;
      }
      if (SuiteRunner.configStorage.get(target.name)?.config) {
        throw new ReferenceError(`${target.name} is already registered, use a different name`);
      }
      SuiteRunner.setConfig<T>(config, target);
  
      if (config.dependsOn.length === 0) {
        SuiteRunner.rootSuites.push(target.name);
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
        SuiteRunner.dependencyStorage.set(dependent.name, [
          ...(SuiteRunner.dependencyStorage.get(dependent.name) ?? []),
          target.name
        ]);
      });
    };
  }

  /**
   * Register a step for a {@link CoreSuite}
   *
   * @param order Order which the step should run
   */
  static Step (order: number) {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    return <T2 extends CoreSuite>(target: T2, prop: FunctionKeys<T2>) => {      
      const config = SuiteRunner.getConfigStore(target.constructor as Type<T2>) as SuiteStorage<T2, unknown[]>;

      if (order in config.steps) {
        throw new Error(`${order} already present on ${target.constructor.name}`);
      }

      config.steps[order] = prop;

      SuiteRunner.setConfigStore(target.constructor as Type<CoreSuite>, config as SuiteStorage<CoreSuite, unknown[]>);
    };
  }

  private static setConfig<T extends (readonly Type<CoreSuite>[])> (
    config: SuiteConfig<T>,
    target: Type<CoreSuite>&(new (...args: SuiteArgs<T>) => CoreSuite)
  ) {
    const configStore: SuiteStorage<CoreSuite, unknown[]> = SuiteRunner.getConfigStore<T>(target);

    configStore.config = config;

    SuiteRunner.configStorage.set(target.name, configStore);
  }

  private static getConfigStore<T extends (readonly Type<CoreSuite>[])> (target: Type<CoreSuite>&(new (...args: SuiteArgs<T>) => CoreSuite)): SuiteStorage<CoreSuite, unknown[]> {
    return SuiteRunner.configStorage.get(target.name) ?? {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: null as any,
      suite: target,
      steps: {}
    };
  }

  private static setConfigStore (
    target: Type<CoreSuite>,
    store: SuiteStorage<CoreSuite, unknown[]>
  ) {
    SuiteRunner.configStorage.set(target.name, store);
  }

  private static detectInfiniteLoops (core: Type<CoreSuite>): Type<CoreSuite>[][] {
    const infiniteLoops: Type<CoreSuite>[][] = [];
  
    const infiniteLoopLoop = (
      currentProp: Type<CoreSuite>,
      currentTree: Type<CoreSuite>[]
    ) => {
      const dependents = SuiteRunner.configStorage.get(currentProp.name)?.config.dependsOn ?? [];
  
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
  private static validateStepPresence (
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
