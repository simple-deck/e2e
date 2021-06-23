import { BrowserServer, chromium, Page } from 'playwright';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';

/* tracks test suite configs */
const configStorage = new Map<string, SuiteStorage<BaseSuite<any>, any[]>>();
/* tracks what test suites run based on this one */
const dependencyStorage = new Map<string, string[]>();
/* tracks what test suites have run */
const completionStorage = new Map<string, boolean>();
/* tracks the results of the test suites that have run */
const suiteResultStorage = new Map<string, unknown>();


const rootSuites: string[] = [];
type Type<T> = { new (...args: any[]): T }
interface SuiteConfig<T extends (readonly Type<BaseSuite<any>>[])> {
  dependsOn: T;
}
type ExtractResult<T> = T extends { new(): BaseSuite<infer R> } ? R : T;


interface DataForSuiteWorker {
  suiteName: string;
  wsEndpoint: string;
  sharedData: SharedArrayBuffer;
  resultStorage: Map<string, unknown>;
}

const dataForSuiteWorker: DataForSuiteWorker = workerData;

interface SuiteStorage<T extends BaseSuite<unknown>, A extends unknown[]> {
  config: SuiteConfig<any>;
  suite: { new(...args: A): T; };
}

interface SuccessRunResult<T> {
  success: true;
  result: T;
}

interface FailRunResult {
  success: false;
  error: Error;
}

type RunResult<T> = SuccessRunResult<T> | FailRunResult;

export abstract class BaseSuite<T> {
  protected page!: Page;
  abstract main (): Promise<T>;
}



class Login extends BaseSuite<string> { async main() { return ''; } }
class Signup extends BaseSuite<number> { async main() { return 0; } }

type SuiteArgs<T> = {
  [P in keyof T]: T[P] extends Type<BaseSuite<infer R>> ? R : never;
};


function detectInfiniteLoops<T> (
  core: Function
): Function[][] {
  const infiniteLoops: Function[][] = [];

  const infiniteLoopLoop = (
    currentProp: Function,
    currentTree: Function[]
  ) => {
    const dependents = configStorage.get(currentProp.name)?.config.dependsOn ?? [];

    dependents.forEach((dependent: Type<BaseSuite<any>>) => {
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

export function Suite <T extends (readonly Type<BaseSuite<any>>[])>(config: SuiteConfig<T>) {
  return <T2 extends BaseSuite<any>>(target: { new(...args: SuiteArgs<T>): T2; }) => {
    if (configStorage.get(target.name)) {
      throw new ReferenceError(`${target.name} is already registered, use a different name`);
    }
    const configStore: SuiteStorage<T2, unknown[]> = {
      config,
      suite: target as any
    };
    configStorage.set(target.name, configStore);

    if (config.dependsOn.length === 0) {
      rootSuites.push(target.name);
    }

    const loops = detectInfiniteLoops(target);

    if (loops.length > 0) {
      console.error(loops.map(loop => loop.join(' => ')));

      throw new Error('Infinite loops detected');
    }

    config.dependsOn.forEach(dependent => {
      dependencyStorage.set(dependent.name, [
        ...(dependencyStorage.get(dependent.name) ?? []),
        target.name
      ]);
    });
      };
}
export class SuiteRunner {
  sharedData = new SharedArrayBuffer(256 * 1024);
  browser!: BrowserServer;
  async createBrowser () {
    this.browser = await chromium.launchServer({
      headless: false
    });
  }
  getSuiteConfig (suite: string) {
    const config = configStorage.get(suite);

    if (!config) {
      throw new ReferenceError(`Could not determine configuration for test suite (${suite}), did you decorate your class?`);
    }

    return config;
  }

  async runSuiteInMain (suiteName: string): Promise<void> {
    const result = await this.awaitWorker(suiteName);
    suiteResultStorage.set(suiteName, result);
    completionStorage.set(suiteName, true);
    const triggeredSuites = dependencyStorage.get(suiteName) ?? [];

    await Promise.all(triggeredSuites.map(async triggeredSuite => {
      const dependentSuites = this.getSuiteConfig(triggeredSuite).config.dependsOn;

      const shouldRunSuite = dependentSuites.every((suite: Type<BaseSuite<any>>) => {
        return completionStorage.get(suite.name) ?? false;
      });

      if (shouldRunSuite) {
        return this.runSuiteInMain(triggeredSuite);
      }
    }));
  }

  private createWorker (data: DataForSuiteWorker) {
    return new Worker(require.main?.filename ?? __filename, {
      workerData: data
    });
  }

  awaitWorker (suiteName: string) {
    console.log('spawning worker for', suiteName);
    return new Promise<unknown>((resolve, reject) => {
      const wsEndpoint = this.browser.wsEndpoint();
      const worker = this.createWorker({
        wsEndpoint,
        sharedData: this.sharedData,
        suiteName,
        resultStorage: suiteResultStorage
      });
  
      worker.on('message', async (result: RunResult<unknown>) => {
        console.log(`worker ${suiteName} succeeded with`, result);
        resolve(result);
        suiteResultStorage.set(suiteName, result);
      });
      
      worker.on('error', (err) => {
        console.log(`worker ${suiteName} failed with`, err);
        reject(err);
      });

    });
  }

  async runSuiteInWorker (): Promise<unknown> {
    const {
      suiteName,
      resultStorage,
      wsEndpoint
    } = dataForSuiteWorker;

    console.log(`worker for ${suiteName} started`);

    const browser = await chromium.connect({
      wsEndpoint: wsEndpoint
    });

    const page = await browser.newPage();

    const config = this.getSuiteConfig(suiteName);

    const suite = new config.suite(
      ...config.config.dependsOn.map((dependent: Type<BaseSuite<any>>) => resultStorage.get(dependent.name))
    );
    suite['page'] = page;

    const result = await suite.main();

    parentPort?.postMessage(result);

    return null;
  }

  async run () {
    await this.createBrowser();
    await Promise.all(rootSuites.map(suite => this.runSuiteInMain(suite)));

    this.browser.close();
  }
}

export async function run () {
  if (isMainThread) {
    new SuiteRunner().run();
  } else {
    new SuiteRunner().runSuiteInWorker();
  }
}
