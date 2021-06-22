import { chromium, Page } from 'playwright';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';

/* tracks test suite configs */
const configStorage = new Map<string, SuiteConfig>();
/* tracks what test suites run based on this one */
const dependencyStorage = new Map<string, Function[]>();
/* tracks what test suites have run */
const completionStorage = new Map<string, boolean>();

const rootSuites: Function[] = [];
interface SuiteConfig {
  dependsOn: Function[];
}

interface SuccessRunResult<T> {
  success: true;
  result: T;
}

interface FailRunResult {
  success: false;
  error: Error;
}

type RunResult<T> = SuccessRunResult<T>|FailRunResult;

export class BaseSuite {
  page!: Page;
}

function detectInfiniteLoops<T> (
  core: Function
): Function[][] {
  const infiniteLoops: Function[][] = [];

  const infiniteLoopLoop = (
    currentProp: Function,
    currentTree: Function[]
  ) => {
    const dependents = configStorage.get(currentProp.name)?.dependsOn ?? [];

    dependents.forEach(dependent => {
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

export function Suite (config: SuiteConfig) {
  return (target: Function) => {
    if (configStorage.get(target.name)) {
      throw new ReferenceError(`${target.name} is already registered, use a different name`);
    }
    configStorage.set(target.name, config);

    if (config.dependsOn.length === 0) {
      rootSuites.push(target);
    }

    const loops = detectInfiniteLoops(target);

    if (loops.length > 0) {
      console.error(loops.map(loop => loop.join(' => ')));

      throw new Error('Infinite loops detected');
    }

    config.dependsOn.forEach(dependent => {
      dependencyStorage.set(dependent.name, [
        ...(dependencyStorage.get(dependent.name) ?? []),
        target
      ]);
    });

    console.log('asdf')
  };
}
export class SuiteRunner {
  getSuiteConfig (suite: Function) {
    const config = configStorage.get(suite.name);

    if (!config) {
      throw new ReferenceError(`Could not determine configuration for test suite (${suite.name}), did you decorate your class?`);
    }

    return config;
  }

  runSuiteInThread (suiteName: string) {

  }

  runSuite (suite: Function) {
    completionStorage.set(suite.name, true);
    const triggeredSuites = dependencyStorage.get(suite.name) ?? [];

    triggeredSuites.forEach(triggeredSuite => {
      const dependentSuites = this.getSuiteConfig(triggeredSuite).dependsOn;

      const shouldRunSuite = dependentSuites.every(suite => {
        return completionStorage.get(suite.name) ?? false;
      });

      if (shouldRunSuite) {
        this.runSuite(triggeredSuite);
      }
    });
  }


  run () {
    
  }
}

export async function run () {
  if (isMainThread) {
    const browser = await chromium.launchServer({
      headless: false
    });

    const workflowResults = new SharedArrayBuffer(256 * 1024);

    const wsEndpoint = browser.wsEndpoint();
    const worker = new Worker(require.main?.filename ?? __filename, {
      workerData: {
        wsEndpoint,
        workflowResults
      }
    });

    worker.on('message', async (result: RunResult<unknown>) => {
      console.log('worker done', result);
      await browser.close();
    });
    console.log(require.main?.filename);
  } else {
    console.log(workerData);
    const browser = await chromium.connect({
      wsEndpoint: workerData.wsEndpoint
    });

    const page = await browser.newPage();

    await page.goto('https://google.com');

    await page.waitForTimeout(5000);

    await browser.close();

    parentPort?.postMessage('DID IT');
  }
}
