import { sync } from 'glob';
import { resolve } from 'path';
import { chromium, firefox, LaunchOptions, webkit } from 'playwright';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { BaseSuite } from './base-suite';
import { Browsers, DataForSuiteWorker, RunResult, SuiteArgs, SuiteConfig, SuiteStorage, Type } from './typings';
const dataForSuiteWorker: DataForSuiteWorker = workerData;

/* tracks test suite configs */
const configStorage = new Map<string, SuiteStorage<BaseSuite<unknown>, unknown[]>>();
/* tracks what test suites run based on this one */
const dependencyStorage = new Map<string, string[]>();
/* Suites with no depends on */
const rootSuites: string[] = [];

/* tracks what test suites have run */
const completionStorage = new Map<string, boolean>();
/* tracks the results of the test suites that have run */
const suiteResultStorage = new Map<string, unknown>();

export class SuiteRunner {
  private static configStorage = configStorage;
  private static dependencyStorage = dependencyStorage;
  private static rootSuites = rootSuites;
  private static completionStorage = completionStorage;
  private static suiteResultStorage = suiteResultStorage;

  private sharedData = new SharedArrayBuffer(256 * 1024);
  private getSuiteConfig (suite: string) {
    const config = SuiteRunner.configStorage.get(suite);

    if (!config) {
      throw new ReferenceError(`Could not determine configuration for test suite (${suite}), did you decorate your class?`);
    }

    return config;
  }

  private debugAsWorker (...messages: string[]) {
    const {
      suiteName,
      browser
    } = dataForSuiteWorker;
    console.log(`worker for ${suiteName} on ${browser}: `, ...messages);
  }

  private async runSuiteInMain (
    suiteName: string,
    browser: Browsers
  ): Promise<void> {
    const result = await this.awaitWorker(suiteName, browser);
    SuiteRunner.suiteResultStorage.set(suiteName, result);
    SuiteRunner.completionStorage.set(suiteName, true);
    const triggeredSuites = SuiteRunner.dependencyStorage.get(suiteName) ?? [];

    await Promise.all(triggeredSuites.map(async triggeredSuite => {
      const dependentSuites = this.getSuiteConfig(triggeredSuite).config.dependsOn;

      const shouldRunSuite = dependentSuites.every((suite: Type<BaseSuite<unknown>>) => {
        return SuiteRunner.completionStorage.get(suite.name) ?? false;
      });

      if (shouldRunSuite) {
        return this.runSuiteInMain(triggeredSuite, browser);
      }
    }));
  }

  private createWorker (data: DataForSuiteWorker) {
    return new Worker(require.main?.filename ?? __filename, {
      workerData: data
    });
  }

  private awaitWorker (suiteName: string, browser: Browsers) {
    const workerName = `worker for ${suiteName} on ${browser}`;
    console.log(`spawning:`, workerName);

    return new Promise<unknown>((res, rej) => {
      const worker = this.createWorker({
        sharedData: this.sharedData,
        suiteName,
        browser,
        resultStorage: SuiteRunner.suiteResultStorage
      });
  
      worker.on('message', async (result: RunResult<unknown>) => {
        if (result.success) {
          console.log(workerName, `succeeded with`, result);
          res(result);
        } else if (result.success === false) {
          console.log(workerName, 'failed with', result.error);
          rej(result.error);
        }
        SuiteRunner.suiteResultStorage.set(suiteName, result);
      });
      
      worker.on('error', (err) => {
        console.log(workerName, 'failed with', err);
        rej(err);
      });
    });
  }

  private determineBrowserFromType (browser: Browsers) {
    switch (browser) {
      case Browsers.chromium:
        return chromium;
      case Browsers.firefox:
        return firefox;
      case Browsers.webkit:
        return webkit;
    }
  }

  private emitDataAsWorker<T> (
    result: RunResult<T>
  ) {
    parentPort?.postMessage(result);
  }

  private async runSuiteInWorker (launchOptions: LaunchOptions): Promise<unknown> {
    const {
      suiteName,
      browser,
      resultStorage
    } = dataForSuiteWorker;

    const browserType = this.determineBrowserFromType(browser);

    this.debugAsWorker(`started`);

    const browserInstance = await browserType.launchPersistentContext(resolve(__dirname, '..', '..', 'data', browser), launchOptions);

    const page = await browserInstance.newPage();

    const config = this.getSuiteConfig(suiteName);

    const suite = new config.suite(
      ...config.config.dependsOn.map((dependent: Type<BaseSuite<unknown>>) => resultStorage.get(dependent.name))
    );

    suite['browser'] = browserInstance;
    suite['page'] = page;
    suite['browserType'] = browser;
    try {
      const result = await suite.main();
      this.emitDataAsWorker({
        success: true,
        result
      });
    } catch (error) {
      this.emitDataAsWorker({
        success: false,
        error
      });
    }


    await browserInstance.close();

    return null;
  }

  private async runInMain (browsers: Browsers[]) {
    const start = Date.now();
    const allPromises = browsers.reduce<Promise<void>[]>((acc, browser) => {
      return [
        ...acc,
        ...SuiteRunner.rootSuites.map(async (suite) => this.runSuiteInMain(suite, browser))
      ];
    }, []);
    await Promise.all(allPromises);
    console.log('All tests finished in: ', Date.now() - start);
  }

  static async run (conf?: {
    browsers: Browsers[],
    importFilePattern?: string,
    launchOptions?: LaunchOptions
  }): Promise<unknown> {
    const {
      importFilePattern,
      browsers = [],
      launchOptions = {
        headless: true
      }
    } = conf ?? {};
    if (importFilePattern) {
      this.importSuites(importFilePattern);
    }

    if (isMainThread) {
      return new SuiteRunner().runInMain(browsers);
    } else {
      return new SuiteRunner().runSuiteInWorker(launchOptions);
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

    console.log('matched', matchedFiles, 'for', filePattern, 'relative to', root);

    // remove file extension
    const importPaths = matchedFiles.map(file => {
      return file.split('.').slice(0, -1).join('.');
    });

    // `require` each file
    importPaths.forEach(path => require(path));
  }

  static Suite<R, T extends (readonly Type<BaseSuite<R>>[])> (config: SuiteConfig<T>) {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    return <T2 extends BaseSuite<unknown>>(target: Type<BaseSuite<unknown>>&{ new(...args: SuiteArgs<T>): T2; }) => {
      if (config.disabled) {
        return;
      }
      if (SuiteRunner.configStorage.get(target.name)) {
        throw new ReferenceError(`${target.name} is already registered, use a different name`);
      }
      SuiteRunner.setConfig<T>(config, target);
  
      if (config.dependsOn.length === 0) {
        SuiteRunner.rootSuites.push(target.name);
      }
  
      const loops = this.detectInfiniteLoops(target as Type<BaseSuite<unknown>>);
  
      if (loops.length > 0) {
        console.error(loops.map(loop => loop.join(' => ')));
  
        throw new Error('Infinite loops detected');
      }
  
      config.dependsOn.forEach(dependent => {
        SuiteRunner.dependencyStorage.set(dependent.name, [
          ...(SuiteRunner.dependencyStorage.get(dependent.name) ?? []),
          target.name
        ]);
      });
    };
  }

  private static setConfig<T extends (readonly Type<BaseSuite<unknown>>[])> (
    config: SuiteConfig<T>,
    target: Type<BaseSuite<unknown>>&(new (...args: SuiteArgs<T>) => BaseSuite<unknown>)
  ) {
    const configStore: SuiteStorage<BaseSuite<unknown>, unknown[]> = SuiteRunner.getConfigStore<T>(target);

    configStore.config = config;

    SuiteRunner.configStorage.set(target.name, configStore);
  }

  private static getConfigStore<T extends (readonly Type<BaseSuite<unknown>>[])> (target: Type<BaseSuite<unknown>>&(new (...args: SuiteArgs<T>) => BaseSuite<unknown>)): SuiteStorage<BaseSuite<unknown>, unknown[]> {
    return SuiteRunner.configStorage.get(target.name) ?? {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: null as any,
      suite: target
    };
  }

  private static detectInfiniteLoops (core: Type<BaseSuite<unknown>>): Type<BaseSuite<unknown>>[][] {
    const infiniteLoops: Type<BaseSuite<unknown>>[][] = [];
  
    const infiniteLoopLoop = (
      currentProp: Type<BaseSuite<unknown>>,
      currentTree: Type<BaseSuite<unknown>>[]
    ) => {
      const dependents = SuiteRunner.configStorage.get(currentProp.name)?.config.dependsOn ?? [];
  
      dependents.forEach((dependent: Type<BaseSuite<unknown>>) => {
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
}
