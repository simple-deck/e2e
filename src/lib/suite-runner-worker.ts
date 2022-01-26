import { AssertionError } from 'chai';
import { resolve } from 'path';
import { BrowserContext, chromium, firefox, Page, webkit } from 'playwright';
import { parentPort, workerData } from 'worker_threads';
import { BaseSuite, CoreSuite } from '../lib/base-suite';
import { testBaseSuite } from './base-suite';
import { generateSuiteResultKey } from './generate-suite-result-key';
import { Browsers, DataForSuiteWorker, RunOptions, SpecResult, SuiteMessageType, SuiteResultMessage, SuiteStorage, SuiteUpdateSharedDataMessage, TestResult, Type, updateSharedDataEvent } from './typings';
const dataForSuiteWorker: DataForSuiteWorker = workerData;

export class SuiteRunnerWorker {

  constructor (
    private suiteConfig: SuiteStorage<CoreSuite, unknown[]>,
    private globalConfig: RunOptions
  ) { }

  private debugAsWorker (...messages: string[]) {
    const {
      suiteName,
      browser
    } = dataForSuiteWorker;
    console.log(`worker for ${suiteName} on ${browser}: `, ...messages);
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
    result: SuiteUpdateSharedDataMessage | SuiteResultMessage<T>
  ) {
    parentPort?.postMessage(result);
  }

  async runSuiteInWorker (): Promise<unknown> {
    const {
      suiteName,
      browser,
      resultStorage,
      sharedStorage
    } = dataForSuiteWorker;

    const browserType = this.determineBrowserFromType(browser);

    this.debugAsWorker(`started`);
    let browserInstance: BrowserContext|null = null;
    try {
      browserInstance = await browserType.launchPersistentContext(resolve(__dirname, '..', '..', 'data', browser), this.globalConfig.launchOptions);

      const page = await browserInstance.newPage();

      const doScreenshot = this.suiteConfig.config.screenshotBetweenStages ?? this.globalConfig.screenshotBetweenStages;

      const argsForSuite = this.getArgsForSuite(resultStorage);

      const suite = this.setupSuite(argsForSuite, browserInstance, page, browser, sharedStorage);
      const listener = (event: {
        key: string;
        value: string|boolean|number;
      }) => {
        this.emitDataAsWorker({
          type: SuiteMessageType.UpdateSharedData,
          key: event.key,
          value: event.value
        });
      };

      suite['sharedDataChanges'].on(updateSharedDataEvent, listener);
  
      try {
        if (suite instanceof BaseSuite) {
          await this.runBaseSuite(suite, doScreenshot);
        } else {
          await this.runCoreSuite(suite, doScreenshot);
        }
      } catch (error) {
        console.error('\nError running: ' + suiteName);
        const testName = `${suite.constructor.name}`;

        await suite.screenshotPage(`${testName}.png`);

        throw error;
      }

      suite['sharedDataChanges'].off(updateSharedDataEvent, listener);
    } catch (error) {
      const formattedError = this.potentiallyLogError(error);

      this.emitDataAsWorker({
        type: SuiteMessageType.FinalResult,
        result: {
          success: false,
          specs: [{
            specName: '',
            success: false,
            error: formattedError,
            time: 0
          }],
          result: null,
          time: 0,
          suiteName: suiteName
        }
      });
    }


    await browserInstance?.close();

    return null;
  }
  
  private async runCoreSuite (suite: CoreSuite, doScreenshot: boolean | undefined) {
    const overallStart = Date.now();
    const steps = this.suiteConfig.steps;
    const allSteps = Object.keys(steps)
      .map(step => +step)
      .sort()
      .map(step => steps[step]);

    const specResults: SpecResult[] = [];
    let success = true;
    for (const method of allSteps) {
      const start = Date.now();
      const testName = `${suite.constructor.name}#${method}`;

      try {
        await suite[method]();
      } catch (e) {
        specResults.push({
          success: false,
          time: Date.now() - start,
          specName: method,
          error: e.stack ?? e.message ?? e
        });
        success = false;

        if (doScreenshot) {
          await suite.screenshotPage(`${testName}.png`);
        }

        break;
      }
      const specResult: SpecResult = {
        success: success,
        specName: method,
        time: Date.now() - start
      };
      if (doScreenshot) {
        await suite.screenshotPage(`${testName}.png`);
      }

      this.debugAsWorker(`${testName} took ${specResult.time}ms`);
    }

    const finalSuiteResult = Object.keys(suite)
      .map(key => key as string & keyof CoreSuite)
      .reduce((acc, key: string & keyof CoreSuite) => {
        if (key in testBaseSuite) {
          return acc;
        } else {
          return {
            ...acc,
            [key]: suite[key]
          };
        }
      }, {});

    this.emitDataAsWorker({
      type: SuiteMessageType.FinalResult,
      result: {
        suiteName: suite.constructor.name,
        success,
        time: Date.now() - overallStart,
        result: JSON.stringify(finalSuiteResult),
        specs: specResults
      }
    });
  }

  private async runBaseSuite (suite: BaseSuite<unknown>, doScreenshot: boolean | undefined) {
    const testName = `${suite.constructor.name}`;
    const start = Date.now();
    let success = true;
    let result: unknown;
    let specResult: SpecResult;
    try {
      result = (await suite.main()) ?? null;
      specResult = {
        time: 0,
        success: true,
        specName: 'main'
      };
    } catch (e) {
      success = false;
      specResult = {
        success: false,
        error: e.stack ?? e.message ?? e,
        time: 0,
        specName: 'main'
      };
    }
    const time = Date.now() - start;
    this.debugAsWorker(`${testName} took ${Date.now() - start}ms`);
    if (doScreenshot) {
      await suite.screenshotPage(`${testName}.png`);
    }

    specResult.time = time;

    this.emitDataAsWorker({
      type: SuiteMessageType.FinalResult,
      result: {
        suiteName: testName,
        success,
        result,
        specs: [specResult],
        time
      }
    });
  }

  private setupSuite (
    argsForSuite: unknown[],
    browserInstance: BrowserContext,
    page: Page,
    browser: Browsers,
    sharedStorage: Map<string, boolean|number|string>
  ) {
    const suite = new this.suiteConfig.suite(
      ...argsForSuite
    );
    
    suite['sharedStorage'] = sharedStorage;
    suite['browser'] = browserInstance;
    suite['page'] = page;
    suite['browserType'] = browser;

    return suite;
  }

  private getArgsForSuite (resultStorage: Map<string, TestResult<string>>) {
    return this.suiteConfig.config.dependsOn.map((dependent: Type<CoreSuite>) => {
      const resultFromStorage = resultStorage.get(generateSuiteResultKey(dataForSuiteWorker.browser, dependent.name));

      if (!resultFromStorage) {
        throw new Error('Could not look up result for ' + dependent.name);
      }
      try {
        return JSON.parse(resultFromStorage.result);
      } catch (e: unknown) {
        const error = e as Error;
        console.error(error);
        throw new Error('Failed to parse result from storage for ' + dependent.name);
      }
    });
  }

  private potentiallyLogError (
    error: Error
  ): string {
    if (error instanceof AssertionError) {
      console.error(error.stack + '\n\n');

      return '';
    } else {
      return error.stack ?? error.toString();
    }
  }
}
