import { sync } from 'glob';
import { isMainThread, Worker } from 'worker_threads';
import { CoreSuite } from './base-suite';
import { CachedMap } from './cached-map';
import { generateSuiteResultKey } from './generate-suite-result-key';
import { ResultsProcessor } from './results-processor';
import { SuiteRunnerStorage } from './suite-runner-storage';
import { SuiteRunnerWorker } from './suite-runner-worker';
import { Browsers, DataForSuiteWorker, FailResult, NonNullableObject, RunOptions, SuiteMessageType, SuiteResultMessage, SuiteUpdateSharedDataMessage, TestResult, TestResultsProcessor, Type } from './typings';



export class SuiteRunner {
  public storage = new SuiteRunnerStorage();
  private logger = console;
  private dataForSuiteWorker: DataForSuiteWorker = this.storage.dataForSuiteWorker;
  private configStorage = this.storage.configStorage;
  private dependencyStorage = this.storage.dependencyStorage;
  private rootSuites = this.storage.rootSuites;
  private suiteResultStorage = this.storage.suiteResultStorage;
  private sharedSuiteStorage = this.storage.sharedSuiteStorage;

  private rootPath = require.main?.path + '/';
  private isMainThread = isMainThread;

  setSuiteResult (browserName: Browsers, suiteName: string, result: TestResult<string>): void {
    this.suiteResultStorage.set(generateSuiteResultKey(browserName, suiteName), result);
  }

  getSuiteResult (browserName: Browsers, suiteName: string): TestResult<string>|undefined {
    return this.suiteResultStorage.get(generateSuiteResultKey(browserName, suiteName));
  }

  /**
   * Looks for a configuration for a suite and throws an error if none exist
   *
   * @param suite Name of the suite to look up
   * @returns The configuration of the suite
   */
  private getSuiteConfig (suite: string) {
    const config = this.configStorage.get(suite);

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
    this.logger.log('running ', suiteName, ' in ', browser);
    const result = await this.awaitWorker(suiteName, browser);

    this.setSuiteResult(browser, suiteName, result);

    const readySuites = this.determineReadySuites(suiteName, browser);

    const [isolatedSuites, concurrentSuites] = this.determineIsolatedSuites(readySuites);
    await this.executeSuitesInOrder(browser, isolatedSuites, concurrentSuites);
  }

  private determineReadySuites (suiteName: string, browser: Browsers) {
    // look up suites that this could potentially trigger
    const triggeredSuites = this.dependencyStorage.get(suiteName) ?? [];

    // for each
    const readySuites = triggeredSuites.filter((triggeredSuite) => {
      // look up all dependent suites
      const dependentSuites = this.getSuiteConfig(triggeredSuite).config.dependsOn;

      // make sure they have ALL already run and have succeeded
      const shouldRunSuite = dependentSuites.every((suite: Type<CoreSuite>) => {
        const result = this.getSuiteResult(browser, suite.name);

        return result?.success ?? false;
      });

      return shouldRunSuite;
    });

    return readySuites;
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

  private async executeSuitesInOrder (
    browser: Browsers,
    isolatedSuites: string[],
    concurrentSuites: string[]
  ) {
    for (const isolatedSuite of isolatedSuites) {
      await this.runSuiteInMain(isolatedSuite, browser);
    }

    await Promise.all(concurrentSuites.map((triggeredSuite) => {
      return this.runSuiteInMain(triggeredSuite, browser);
    }));
  }
  /* istanbul ignore next */
  private createWorker (data: DataForSuiteWorker) {
    return new Worker(require.main?.filename ?? __filename, {
      workerData: data
    });
  }
  /* istanbul ignore next */
  private require (path: string) {
    return require(path);
  }
  /* istanbul ignore next */
  private globSearch (...args: Parameters<typeof sync>) {
    return sync(...args);
  }
  
  private async awaitWorker (
    suiteName: string,
    browser: Browsers
  ) {
    const workerName = `worker for ${suiteName} on ${browser}`;

    const existingResult = this.getSuiteResult(browser, suiteName);
    if (existingResult?.success) {
      this.logger.log(`skipping: ${workerName}`);

      return existingResult;
    }

    this.logger.log(`spawning:`, workerName);

    return new Promise<TestResult<string>>((res, rej) => {
      const worker = this.createWorker({
        suiteName,
        browser,
        resultStorage: this.suiteResultStorage,
        sharedStorage: this.sharedSuiteStorage
      });
  
      const workerMessageHandler = this.handleWorkerMessage(
        workerName,
        (value) => {
          worker.off('message', workerMessageHandler);
          res(value);
        },
        rej,
        browser,
        suiteName
      );

      worker.on('message', workerMessageHandler);

      worker.on('error', (err) => {
        this.logger.log(workerName, 'failed with', err);
        rej(err);
      });
    });
  }


  private handleWorkerMessage (
    workerName: string,
    res: (value: TestResult<string> | PromiseLike<TestResult<string>>) => void,
    rej: (reason: Error|string) => void,
    browser: Browsers,
    suiteName: string
  ): (value: SuiteUpdateSharedDataMessage | SuiteResultMessage<string>) => void {
    return async (message: SuiteUpdateSharedDataMessage | SuiteResultMessage<string>) => {
      if (message.type === SuiteMessageType.FinalResult) {
        const { result } = message;
        if (result.success) {
          this.logger.log(workerName, `succeeded with`, result);
          res(result);
        } else if (result.success === false) {
          const errorSpec = result.specs.find(spec => spec.success === false) as FailResult;
          // this.logger.log(workerName, 'failed with', result.error);
          rej(errorSpec?.error);
        }
        this.setSuiteResult(browser, suiteName, result);
      } else if (message.type === SuiteMessageType.UpdateSharedData) {
        this.sharedSuiteStorage.set(message.key, message.value);
      }
    };
  }

  private async runBrowserInMain (browser: Browsers): Promise<boolean> {
    const start = Date.now();
    
    const [isolatedSuites, concurrentSuites] = this.determineIsolatedSuites(this.rootSuites);
    try {
      await this.executeSuitesInOrder(browser, isolatedSuites, concurrentSuites);
    } catch (e) {
      this.logger.error(`${browser} failed with ${e}`);

      return false;
    }
    this.logger.log('All tests finished in: ', Date.now() - start);

    return true;
  }

  private generateConfigWithDefaults (options: RunOptions) {
    const {
      importFilePattern = '',
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
      testResults = {
        location: '',
        processor: TestResultsProcessor.JUnit
      }
    } = options;

    return {
      importFilePattern,
      browsers,
      launchOptions,
      runBrowsersInParallel,
      screenshotBetweenStages,
      autoResume,
      testResults
    };
  }

  async run (options: RunOptions): Promise<void> {
    const conf: NonNullableObject<RunOptions> = this.generateConfigWithDefaults(options);

    const {
      autoResume,
      importFilePattern,
      runBrowsersInParallel,
      browsers
    } = conf;
    if (autoResume.enabled) {
      this.suiteResultStorage = new CachedMap(autoResume.location);
    }

    if (importFilePattern) {
      this.importSuites(importFilePattern);
    }

    if (this.isMainThread) {
      await this.runMain(runBrowsersInParallel, browsers, options);
    } else {
      await this.runWorker(this.dataForSuiteWorker.suiteName, conf);
    }
  }

  private async runWorker (
    suiteName: string,
    conf: NonNullableObject<RunOptions>
  ) {
    const suiteRunnerWorker = new SuiteRunnerWorker(
      this.getSuiteConfig(suiteName),
      conf
    );

    await suiteRunnerWorker.runSuiteInWorker();
  }

  private async runMain (runBrowsersInParallel: boolean, browsers: Browsers[], options: RunOptions) {
    const start = Date.now();
    const allPassed = await this.runBrowsersInMain(runBrowsersInParallel, browsers);

    if (allPassed) {
      this.suiteResultStorage.clear();
    }

    const allResults = [...this.suiteResultStorage.values()];

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
  }

  private async runBrowsersInMain (
    runBrowsersInParallel: boolean,
    browsers: Browsers[]
  ) {
    let allPassed = true;
    if (runBrowsersInParallel) {
      await Promise.all(browsers.map(async (browser) => {
        const thisPassed = await this.runBrowserInMain(browser);
        if (!thisPassed) {
          allPassed = false;
        }
      }));
    } else {
      for (const browser of browsers) {
        const thisPassed = await this.runBrowserInMain(browser);

        if (!thisPassed) {
          allPassed = false;
        }
      }
    }

    return allPassed;
  }

  private importSuites (
    filePattern: string
  ) {
    const root = this.rootPath;
    // glob search from current working directory
    const matchedFiles = this.globSearch(filePattern, {
      cwd: root,
      absolute: true
    });

    if (isMainThread) {
      this.logger.log('matched', matchedFiles, 'for', filePattern, 'relative to', root);
    }

    // remove file extension
    const importPaths = matchedFiles.map(file => {
      return file.split('.').slice(0, -1).join('.');
    });

    // `require` each file
    importPaths.forEach(path => this.require(path));
  }

  static run (config: RunOptions): Promise<void> {
    return new SuiteRunner().run(config);
  }
}
