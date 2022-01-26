/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { CachedMap } from './cached-map';
import { SuiteRunner } from './suite-runner';
import { SuiteRunnerWorker } from './suite-runner-worker';
import { generateConfig, generateResult, SampleSuite } from './test-helpers';
import { Browsers, FailResult, RunOptions, SuiteMessageType, SuiteResultMessage, SuiteStorage, SuiteUpdateSharedDataMessage } from './typings';


describe(SuiteRunner, () => {
  let suiteRunner = new SuiteRunner();
  beforeEach(() => {
    suiteRunner = new SuiteRunner();
    suiteRunner['logger'] = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as any;
    suiteRunner['isMainThread'] = true;
  });
  afterEach(() => {
    jest.resetAllMocks();
    suiteRunner['configStorage'].clear();
    suiteRunner['dependencyStorage'].clear();
    suiteRunner['rootSuites'] = [];
    suiteRunner['suiteResultStorage'].clear();
    suiteRunner['sharedSuiteStorage'].clear();
  });
  describe('result storage', () => {

    const suiteName = 'suite';
    const browser = Browsers.chromium;
    it('should be able to get and set results', () => {
      const result = generateResult();
      suiteRunner.setSuiteResult(browser, suiteName, result);
      
      const found = suiteRunner.getSuiteResult(browser, suiteName);
      
      expect(found).toBe(result);
    });
    
    it('should not have results from different browsers', () => {
      const result = generateResult();

      suiteRunner.setSuiteResult(browser, suiteName, result);

      const found = suiteRunner.getSuiteResult(Browsers.firefox, suiteName);

      expect(found).toBeUndefined();
    });
  });

  describe('config storage', () => {
    const config: SuiteStorage<any, any> = generateConfig();
    it('should be able to find existing configs', () => {
      suiteRunner['configStorage'].set(SampleSuite.name, config);

      expect(suiteRunner['getSuiteConfig'](SampleSuite.name)).toBe(config);
    });


    it('should throw an error when the config is not present', () => {
      suiteRunner['configStorage'].delete(SampleSuite.name);

      expect(() => suiteRunner['getSuiteConfig'](SampleSuite.name)).toThrowError();
    });
  });

  describe('runSuiteInMain', () => {
    it('should set the suite result on success', async () => {
      const result = generateResult();
      
      suiteRunner['awaitWorker'] = async () => result;

      await suiteRunner['runSuiteInMain'](SampleSuite.name, Browsers.chromium);

      expect(suiteRunner.getSuiteResult(Browsers.chromium, SampleSuite.name)).toBe(result);
    });
  });

  describe('determineReadySuites', () => {

    it('should run suites that have all dependencies succeeded', () => {
      class suite1 extends SampleSuite { }
      class suite2 extends SampleSuite { }

      class suite3 extends SampleSuite { }

      const suite3Config = generateConfig();

      suite3Config.suite = suite3;
      suite3Config.steps = [];
  
      suite3Config.config.dependsOn = [suite1, suite2] as never[];

      const suite1Result = generateResult();
      const suite2Result = generateResult();


      suite1Result.success = true;
      suite2Result.success = true;

      const triggeredSuites = [
        suite3.name
      ];

      // 1 triggers 3
      suiteRunner['dependencyStorage'].set(suite1.name, triggeredSuites);
      // 2 triggers 3
      suiteRunner['dependencyStorage'].set(suite2.name, triggeredSuites);

      suiteRunner.storage['setConfigStore'](suite3, suite3Config);

      suiteRunner.setSuiteResult(Browsers.chromium, suite1.name, suite1Result);

      suiteRunner.setSuiteResult(Browsers.chromium, suite2.name, suite2Result);

      const readySuites = suiteRunner['determineReadySuites'](suite2.name, Browsers.chromium);
      expect(readySuites).toEqual(['suite3']);
    });

    it('should not run suites that have failed', () => {
      const suite1 = 'suite1';
      const suite2 = 'suite2';

      class suite3 extends SampleSuite { }

      const suite3Config = generateConfig();

      suite3Config.suite = suite3;
      suite3Config.steps = [];
  
      suite3Config.config.dependsOn = [suite1, suite2] as never[];

      const suite1Result = generateResult();
      const suite2Result = generateResult();


      suite1Result.success = true;
      suite2Result.success = false;

      const triggeredSuites = [
        suite3.name
      ];

      // 1 triggers 3
      suiteRunner['dependencyStorage'].set(suite1, triggeredSuites);
      // 2 triggers 3
      suiteRunner['dependencyStorage'].set(suite2, triggeredSuites);

      suiteRunner.storage['setConfigStore'](suite3, suite3Config);

      suiteRunner.setSuiteResult(Browsers.chromium, suite1, suite1Result);

      suiteRunner.setSuiteResult(Browsers.chromium, suite2, suite2Result);

      const readySuites = suiteRunner['determineReadySuites'](suite2, Browsers.chromium);
      expect(readySuites).toEqual([]);
    });


    it('should not run suites that have pending dependencies', () => {
      const suite1 = 'suite1';
      const suite2 = 'suite2';

      class suite3 extends SampleSuite { }

      const suite3Config = generateConfig();

      suite3Config.suite = suite3;
      suite3Config.steps = [];
  
      suite3Config.config.dependsOn = [suite1, suite2] as never[];

      const triggeredSuites = [
        suite3.name
      ];

      // 1 triggers 3
      suiteRunner['dependencyStorage'].set(suite1, triggeredSuites);
      // 2 triggers 3
      suiteRunner['dependencyStorage'].set(suite2, triggeredSuites);

      suiteRunner.storage['setConfigStore'](suite3, suite3Config);

      const readySuites = suiteRunner['determineReadySuites'](suite2, Browsers.chromium);
      expect(readySuites).toEqual([]);
    });
  });

  describe('suite concurrency', () => {
    class suite1Isolate extends SampleSuite { }
    class suite2Isolate extends SampleSuite { }
    class suite3Concurrent extends SampleSuite { }
    class suite4Concurrent extends SampleSuite { }

    const suite1IsolateConfig = generateConfig();
    const suite2IsolateConfig = generateConfig();
    const suite3Config = generateConfig();
    const suite4Config = generateConfig();
    
    suite1IsolateConfig.config.runInIsolation = true;
    suite2IsolateConfig.config.runInIsolation = true;
    suite3Config.config.runInIsolation = false;
    suite4Config.config.runInIsolation = false;
    beforeEach(() => {
      suiteRunner.storage.setConfigStore(suite1Isolate, suite1IsolateConfig);
      suiteRunner.storage.setConfigStore(suite2Isolate, suite2IsolateConfig);
      suiteRunner.storage.setConfigStore(suite3Concurrent, suite3Config);
      suiteRunner.storage.setConfigStore(suite4Concurrent, suite4Config);
    });

    it('should correctly put the suites in order (experimental)', () => {
      process.env.SD_EXPERIMENTAL_CONCURRENCY = 'enabled';

      const result = suiteRunner['determineIsolatedSuites']([
        suite1Isolate.name,
        suite2Isolate.name,
        suite3Concurrent.name,
        suite4Concurrent.name
      ]);


      expect(result).toEqual([
        [
          suite1Isolate.name,
          suite2Isolate.name
        ],
        [
          suite3Concurrent.name,
          suite4Concurrent.name
        ]
      ]);
    });


    it('should correctly put the suites in order', () => {
      process.env.SD_EXPERIMENTAL_CONCURRENCY = '';

      const result = suiteRunner['determineIsolatedSuites']([
        suite1Isolate.name,
        suite2Isolate.name,
        suite3Concurrent.name,
        suite4Concurrent.name
      ]);


      expect(result).toEqual([
        [
          suite1Isolate.name,
          suite2Isolate.name,
          suite3Concurrent.name,
          suite4Concurrent.name
        ],
        []
      ]);
    });

    it('should run isolate suites in order', async () => {
      // the second promise should not start until the first one is finished
      const consecutive1 = () => new Promise<void>((r) => setTimeout(() => r(), 9));
      const consecutive2 = () => new Promise<void>((r) => setTimeout(() => r(), 7));

      // the second promise should resolve before the first
      const concurrent1 = () => new Promise<void>((r) => setTimeout(() => r(), 5));
      const concurrent2 = () => new Promise<void>((r) => r());

      const results: string[] = [];

      suiteRunner['runSuiteInMain'] = async (suiteName: string) => {
        switch (suiteName) {
          case suite1Isolate.name:
            expect(results).toEqual([]);
            await consecutive1();
            break;
          case suite2Isolate.name:
            expect(results).toEqual([suite1Isolate.name]);
            await consecutive2();
            break;
          case suite3Concurrent.name:
            expect(results).toEqual([suite1Isolate.name, suite2Isolate.name]);
            await concurrent1();
            break;
          case suite4Concurrent.name:
            await concurrent2();
            break;
          default:
            throw new Error();
          }
          results.push(suiteName);
      };

      await suiteRunner['executeSuitesInOrder'](
        Browsers.chromium,
        [suite1Isolate.name, suite2Isolate.name],
        [suite3Concurrent.name, suite4Concurrent.name]
      );

      expect(results).toEqual([suite1Isolate.name, suite2Isolate.name, suite4Concurrent.name, suite3Concurrent.name]);
    });
  });

  describe('handleWorkerMessage', () => {
    it('should handle a successful worker result message', () => {
      let resolveArg: any;
      const res = (arg: any) => {
        resolveArg = arg;
      };
      let rejectCalled = false;
      const reject = () => {
        rejectCalled = true;
      };
      const handler = suiteRunner['handleWorkerMessage']('worker', res, reject, Browsers.chromium, 'suiteName');

      const result = generateResult();
      result.success = true;
      const message: SuiteResultMessage<string> = {
        type: SuiteMessageType.FinalResult,
        result
      };

      handler(message);

      expect(resolveArg).toBe(result);
      expect(rejectCalled).toBeFalsy();
    });

    it('should handle a failed worker result message', () => {
      let rejectArg: any;
      const reject = (arg: any) => {
        rejectArg = arg;
      };
      let resolveCalled = false;
      const res = () => {
        resolveCalled = true;
      };
      const handler = suiteRunner['handleWorkerMessage']('worker', res, reject, Browsers.chromium, 'suiteName');

      const result = generateResult();
      result.success = false;
      const error = 'error';
      const spec: FailResult = {
        specName: '',
        success: false,
        error,
        time: 0
      };
      result.specs = [spec];
      const message: SuiteResultMessage<string> = {
        type: SuiteMessageType.FinalResult,
        result
      };

      handler(message);

      expect(rejectArg).toBe(error);
      expect(resolveCalled).toBeFalsy();
    });

    it('should handle a error worker with no message', () => {
      let rejectArg: any;
      const reject = (arg: any) => {
        rejectArg = arg;
      };
      let resolveCalled = false;
      const res = () => {
        resolveCalled = true;
      };
      const handler = suiteRunner['handleWorkerMessage']('worker', res, reject, Browsers.chromium, 'suiteName');

      const result = generateResult();
      result.success = false;
      result.specs = [];
      const message: SuiteResultMessage<string> = {
        type: SuiteMessageType.FinalResult,
        result
      };

      handler(message);

      expect(rejectArg).toBe(undefined);
      expect(resolveCalled).toBeFalsy();
    });


    it('should handle an update value message', () => {
      let resolveCalled = false;
      const res = () => {
        resolveCalled = true;
      };
      let rejectCalled = false;
      const reject = () => {
        rejectCalled = true;
      };
      const handler = suiteRunner['handleWorkerMessage']('worker', res, reject, Browsers.chromium, 'suiteName');

      const key = 'key';
      const value = 'value';

      const message: SuiteUpdateSharedDataMessage = {
        type: SuiteMessageType.UpdateSharedData,
        key,
        value
      };

      handler(message);

      expect(suiteRunner['sharedSuiteStorage'].get(key)).toBe(value);

      expect(rejectCalled).toBeFalsy();
      expect(resolveCalled).toBeFalsy();
    });
  });

  describe('importSuites', () => {
    it('should be able to load in the correct suites', () => {
      const _globSearch = suiteRunner['globSearch'];
      const _root = suiteRunner['rootPath'];
      const _require = suiteRunner['require'];

      const requireCalls: string[] = [];

      suiteRunner['require'] = (path: string) => requireCalls.push(path);
      suiteRunner['rootPath'] = '/root/';
      suiteRunner['globSearch'] = () => ['/path/to/file.js'];

      suiteRunner['importSuites']('');

      expect(requireCalls).toEqual(['/path/to/file']);

      suiteRunner['rootPath'] = _root;
      suiteRunner['globSearch'] = _globSearch;
      suiteRunner['require'] = _require;
    });
  });

  describe('generateConfigWithDefaults', () => {
    it('should provide defaults', () => {
      const originalRunOptions: RunOptions = {
        browsers: []
      };

      const defaulted = suiteRunner['generateConfigWithDefaults'](originalRunOptions);

      expect(defaulted).toHaveProperty('autoResume');
      expect(defaulted).toHaveProperty('importFilePattern');
      expect(defaulted).toHaveProperty('runBrowsersInParallel');
    });
  });

  describe('run', () => {
    it('should correctly patch result storage', async () => {
      suiteRunner.run({
        browsers: []
      });

      expect(suiteRunner['suiteResultStorage'] instanceof CachedMap).toBeFalsy();

      await suiteRunner.run({
        browsers: [],
        autoResume: {
          enabled: true,
          location: resolve(mkdtempSync(resolve(tmpdir(), 'e2e-runner')), 'cache')
        }
      });

      expect(suiteRunner['suiteResultStorage'] instanceof CachedMap).toBeTruthy();
    });

    it('should run in main when relevant', async () => {
      spyOn(suiteRunner as any, 'runMain');
      spyOn(suiteRunner as any, 'runWorker');

      suiteRunner['isMainThread'] = true;

      await suiteRunner['run']({
        browsers: []
      });

      expect(suiteRunner['runMain']).toHaveBeenCalled();
      expect(suiteRunner['runWorker']).not.toHaveBeenCalled();
    });


    it('should run in worker when relevant', async () => {
      spyOn(suiteRunner as any, 'runMain');
      spyOn(suiteRunner as any, 'runWorker');

      suiteRunner['isMainThread'] = false;
      suiteRunner['dataForSuiteWorker'] = {
        suiteName: ''
      } as any;

      await suiteRunner['run']({
        browsers: []
      });

      expect(suiteRunner['runMain']).not.toHaveBeenCalled();
      expect(suiteRunner['runWorker']).toHaveBeenCalled();
    });

    it('should not auto-import if path is not provided', async () => {
      spyOn(suiteRunner as any, 'importSuites');

      await suiteRunner['run']({
        browsers: []
      });

      expect(suiteRunner['importSuites']).not.toHaveBeenCalled();
    });


    it('should auto-import if path is provided', async () => {
      spyOn(suiteRunner as any, 'importSuites');

      await suiteRunner['run']({
        browsers: [],
        importFilePattern: '**'
      });

      expect(suiteRunner['importSuites']).toHaveBeenCalled();
    });
  });

  describe('runBrowsersInMain', () => {
    it('should run concurrently when relevant', async () => {
      const browsers = [
        Browsers.chromium,
        Browsers.webkit
      ];

      const results: Browsers[] = [];

      spyOn(suiteRunner as any, 'runBrowserInMain').and.callFake(async (browser: Browsers) => {
        if (browser === Browsers.chromium) {
          await new Promise<boolean>((r) => setTimeout(() => r(true), 10));
        } else {
          await new Promise<boolean>((r) => r(true));
        }

        results.push(browser);
      });

      await suiteRunner['runBrowsersInMain'](
        true,
        browsers
      );

      expect(results).toEqual([
        Browsers.webkit,
        Browsers.chromium
      ]);
    });

    it('should run concurrently when relevant', async () => {
      const browsers = [
        Browsers.chromium,
        Browsers.webkit
      ];

      const results: Browsers[] = [];

      spyOn(suiteRunner as any, 'runBrowserInMain').and.callFake(async (browser: Browsers) => {
        if (browser === Browsers.chromium) {
          await new Promise<boolean>((r) => setTimeout(() => r(true), 10));
        } else {
          await new Promise<boolean>((r) => r(true));
        }

        results.push(browser);
      });

      await suiteRunner['runBrowsersInMain'](
        false,
        browsers
      );

      expect(results).toEqual([
        Browsers.chromium,
        Browsers.webkit
      ]);
    });
  });

  describe('runWorker', () => {
    it('should call `runSuiteInWorker`', async () => {
      const spy = spyOn(SuiteRunnerWorker.prototype as any, 'runSuiteInWorker').and.returnValue({});

      suiteRunner.storage.setConfig({ dependsOn: [] }, SampleSuite);

      await suiteRunner['runWorker'](
        SampleSuite.name,
        suiteRunner['generateConfigWithDefaults']({ browsers: [] })
      );

      expect(spy).toHaveBeenCalled();

      jest.clearAllMocks();
    });
  });

  describe('awaitWorker', () => {
    it('should return an existing result if present and successful', async () => {
      const existingResult = generateResult();
      existingResult.success = true;
      suiteRunner.setSuiteResult(Browsers.chromium, SampleSuite.name, existingResult);

      const result = await suiteRunner['awaitWorker'](SampleSuite.name, Browsers.chromium);

      expect(result).toBe(existingResult);
    });
  });
});
