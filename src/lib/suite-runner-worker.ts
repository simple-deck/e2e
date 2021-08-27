import { AssertionError } from 'chai';
import { resolve } from 'path';
import { BrowserContext, chromium, firefox, Page, webkit } from 'playwright';
import { parentPort, workerData } from 'worker_threads';
import { BaseSuite, CoreSuite } from '../lib/base-suite';
import { testBaseSuite } from './base-suite';
import { Browsers, DataForSuiteWorker, RunOptions, RunResult, SuiteStorage, Type } from './typings';
const dataForSuiteWorker: DataForSuiteWorker = workerData;

export class SuiteRunnerWorker {

  constructor (
    private suiteConfig: SuiteStorage<any, any>,
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
    result: RunResult<T>
  ) {
    parentPort?.postMessage(result);
  }

  async runSuiteInWorker (): Promise<unknown> {
    const {
      suiteName,
      browser,
      resultStorage
    } = dataForSuiteWorker;

    const browserType = this.determineBrowserFromType(browser);

    this.debugAsWorker(`started`);
    let browserInstance: BrowserContext|null = null;
    try {
      browserInstance = await browserType.launchPersistentContext(resolve(__dirname, '..', '..', 'data', browser), this.globalConfig.launchOptions);

      const page = await browserInstance.newPage();

      const doScreenshot = this.suiteConfig.config.screenshotBetweenStages ?? this.globalConfig.screenshotBetweenStages;

      const argsForSuite = this.getArgsForSuite(resultStorage);

      const suite = this.setupSuite(argsForSuite, browserInstance, page, browser);
  
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
    } catch (error) {
      const formattedError = this.potentiallyLogError(error);

      this.emitDataAsWorker({
        success: false,
        error: formattedError
      });
    }


    await browserInstance?.close();

    return null;
  }
  
  private async runCoreSuite (suite: any, doScreenshot: boolean | undefined) {
    const steps = this.suiteConfig.steps;
    const allSteps = Object.keys(steps)
      .map(step => +step)
      .sort()
      .map(step => steps[step]);

    for (const method of allSteps) {
      const start = Date.now();
      await suite[method]();
      const testName = `${suite.constructor.name}#${method}`;
      if (doScreenshot) {
        await suite.screenshotPage(`${testName}.png`);
      }
      this.debugAsWorker(`${testName} took ${Date.now() - start}ms`);
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
      success: true,
      result: JSON.stringify(finalSuiteResult)
    });
  }

  private async runBaseSuite (suite: BaseSuite<any>, doScreenshot: boolean | undefined) {
    const testName = `${suite.constructor.name}`;
    const start = Date.now();
    const result = await suite.main();
    this.debugAsWorker(`${testName} took ${Date.now() - start}ms`);
    if (doScreenshot) {
      await suite.screenshotPage(`${testName}.png`);
    }

    this.emitDataAsWorker({
      success: true,
      result
    });
  }

  private setupSuite (argsForSuite: any[], browserInstance: BrowserContext, page: Page, browser: Browsers) {
    const suite = new this.suiteConfig.suite(
      ...argsForSuite
    );

    suite['browser'] = browserInstance;
    suite['page'] = page;
    suite['browserType'] = browser;

    return suite;
  }

  private getArgsForSuite (resultStorage: Map<string, import("/Users/john.saady/Projects/Personal/simple-deck/e2e/src/lib/typings").SuccessRunResult<string>>) {
    return this.suiteConfig.config.dependsOn.map((dependent: Type<CoreSuite>) => {
      const resultFromStorage = resultStorage.get(dependent.name);

      if (!resultFromStorage) {
        throw new Error('Could not look up result for ' + dependent.name);
      }
      try {
        return JSON.parse(resultFromStorage.result);
      } catch (e) {
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