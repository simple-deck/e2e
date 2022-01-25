import { BaseSuite } from './base-suite';
import { Step, Suite } from './decorators';
import { SuiteRunner } from './suite-runner';
import { Browsers, FailResult, StepError, SuiteMessageType, SuiteResultMessage, SuiteStorage, SuiteUpdateSharedDataMessage, TestResult } from './typings';

const suite = 'suite';

const generateResult = (): TestResult<string> => ({
  result: '',
  specs: [],
  success: true,
  suiteName: suite,
  time: 0
});

const generateConfig = (): SuiteStorage<any, any> => ({
  config: {
    dependsOn: []
  },
  steps: [],
  suite: SampleSuite
});

class SampleSuite extends BaseSuite<void> {
  hostname = '';
  main () { /* empty */ }
}

describe(SuiteRunner, () => {
  describe('result storage', () => {

    const suiteName = 'suite';
    const browser = Browsers.chromium;
    it('should be able to get and set results', () => {
      const result = generateResult();
      SuiteRunner.setSuiteResult(browser, suiteName, result);
      
      const found = SuiteRunner.getSuiteResult(browser, suiteName);
      
      expect(found).toBe(result);
    });
    
    it('should not have results from different browsers', () => {
      const result = generateResult();

      SuiteRunner.setSuiteResult(browser, suiteName, result);

      const found = SuiteRunner.getSuiteResult(Browsers.firefox, suiteName);

      expect(found).toBeUndefined();
    });
  });

  describe('config storage', () => {
    const config: SuiteStorage<any, any> = generateConfig();
    const runner = new SuiteRunner();
    it('should be able to find existing configs', () => {
      SuiteRunner['configStorage'].set(suite, config);

      expect(runner['getSuiteConfig'](suite)).toBe(config);
    });


    it('should throw an error when the config is not present', () => {
      SuiteRunner['configStorage'].delete(suite);

      expect(() => runner['getSuiteConfig'](suite)).toThrowError();
    });
  });

  describe('runSuiteInMain', () => {
    it('should set the suite result on success', async () => {
      const runner = new SuiteRunner();
      const result = generateResult();
      
      runner['awaitWorker'] = async () => result;

      await runner['runSuiteInMain'](suite, Browsers.chromium);

      expect(SuiteRunner.getSuiteResult(Browsers.chromium, suite)).toBe(result);
    });
  });

  describe('determineReadySuites', () => {
    let runner: SuiteRunner;

    beforeEach(() => {
      runner = new SuiteRunner();
    });


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
      SuiteRunner['dependencyStorage'].set(suite1.name, triggeredSuites);
      // 2 triggers 3
      SuiteRunner['dependencyStorage'].set(suite2.name, triggeredSuites);

      SuiteRunner['setConfigStore'](suite3, suite3Config);

      SuiteRunner.setSuiteResult(Browsers.chromium, suite1.name, suite1Result);

      SuiteRunner.setSuiteResult(Browsers.chromium, suite2.name, suite2Result);

      const readySuites = runner['determineReadySuites'](suite2.name, Browsers.chromium);
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
      SuiteRunner['dependencyStorage'].set(suite1, triggeredSuites);
      // 2 triggers 3
      SuiteRunner['dependencyStorage'].set(suite2, triggeredSuites);

      SuiteRunner['setConfigStore'](suite3, suite3Config);

      SuiteRunner.setSuiteResult(Browsers.chromium, suite1, suite1Result);

      SuiteRunner.setSuiteResult(Browsers.chromium, suite2, suite2Result);

      const readySuites = runner['determineReadySuites'](suite2, Browsers.chromium);
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
      SuiteRunner['dependencyStorage'].set(suite1, triggeredSuites);
      // 2 triggers 3
      SuiteRunner['dependencyStorage'].set(suite2, triggeredSuites);

      SuiteRunner['setConfigStore'](suite3, suite3Config);

      const readySuites = runner['determineReadySuites'](suite2, Browsers.chromium);
      expect(readySuites).toEqual([]);
    });
  });

  describe('suite concurrency', () => {
    const runner = new SuiteRunner();

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

    SuiteRunner['setConfigStore'](suite1Isolate, suite1IsolateConfig);
    SuiteRunner['setConfigStore'](suite2Isolate, suite2IsolateConfig);
    SuiteRunner['setConfigStore'](suite3Concurrent, suite3Config);
    SuiteRunner['setConfigStore'](suite4Concurrent, suite4Config);

    it('should correctly put the suites in order (experimental)', () => {
      process.env.SD_EXPERIMENTAL_CONCURRENCY = 'enabled';

      const result = runner['determineIsolatedSuites']([
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

      const result = runner['determineIsolatedSuites']([
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
      const suiteRunner = new SuiteRunner();

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
            expect(results).toEqual([])
            await consecutive1();
            break;
            case suite2Isolate.name:
            expect(results).toEqual([suite1Isolate.name])
            await consecutive2();
            break;
            case suite3Concurrent.name:
            expect(results).toEqual([suite1Isolate.name, suite2Isolate.name])
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
    const runner = new SuiteRunner();
    it('should handle a successful worker result message', () => {
      let resolveArg: any;
      const resolve = (arg: any) => {
        resolveArg = arg;
      };
      let rejectCalled = false;
      const reject = () => {
        rejectCalled = true;
      };
      const handler = runner['handleWorkerMessage']('worker', resolve, reject, Browsers.chromium, 'suiteName');

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
      const resolve = () => {
        resolveCalled = true;
      };
      const handler = runner['handleWorkerMessage']('worker', resolve, reject, Browsers.chromium, 'suiteName');

      const result = generateResult();
      result.success = false;
      const error = 'error'
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
      const resolve = () => {
        resolveCalled = true;
      };
      const handler = runner['handleWorkerMessage']('worker', resolve, reject, Browsers.chromium, 'suiteName');

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
      const resolve = (arg: any) => {
        resolveCalled = true;
      };
      let rejectCalled = false;
      const reject = () => {
        rejectCalled = true;
      };
      const handler = runner['handleWorkerMessage']('worker', resolve, reject, Browsers.chromium, 'suiteName');

      const key = 'key';
      const value = 'value';

      const message: SuiteUpdateSharedDataMessage = {
        type: SuiteMessageType.UpdateSharedData,
        key,
        value
      };

      handler(message);

      expect(SuiteRunner['sharedSuiteStorage'].get(key)).toBe(value);

      expect(rejectCalled).toBeFalsy();
      expect(resolveCalled).toBeFalsy();
    });
  });

  describe('steps', () => {

    const validSteps = {
      1: 'test',
      2: 'test2'
    };

    const missingStep = {
      1: 'test',
      3: 'test2'
    };

    const noSteps = {};

    const duplicateStep = {
      1: 'test',
      2: 'test'
    };

    it('should be able to validate valid steps', () => {
      const validationResult = SuiteRunner['validateStepPresence'](validSteps);

      expect(validationResult).toEqual('');
    });

    it('should be able to invalidate empty steps', () => {
      const validationResult = SuiteRunner['validateStepPresence'](noSteps);

      expect(validationResult).toEqual(StepError.noSteps);
    });

    it('should be able to invalidate missing steps', () => {
      const validationResult = SuiteRunner['validateStepPresence'](missingStep);

      expect(validationResult.startsWith(StepError.missingStep)).toBeTruthy();
    });


    it('should be able to invalidate methods with multiple step numbers', () => {
      const validationResult = SuiteRunner['validateStepPresence'](duplicateStep);

      expect(validationResult.startsWith(StepError.methodOnMultipleSteps)).toBeTruthy();
    });
  });

  describe('Suite', () => {
    class SuiteTest extends SampleSuite { }

    afterEach(() => {
      SuiteRunner['configStorage'].delete(SuiteTest.name);
    });

    it('should ignore disabled suites', () => {
      Suite({
        disabled: true,
        dependsOn: []
      })(SuiteTest);

      expect(SuiteRunner['configStorage'].get(SuiteTest.name)).toBe(undefined);
    });


    it('should throw on already registered suites', () => {
      Suite({
        dependsOn: []
      })(SuiteTest);

      expect(() => Suite({ dependsOn: [] })(SuiteTest)).toThrow();
    });

    it('should recognize root suites', () => {
      Suite({
        dependsOn: []
      })(SuiteTest);

      expect(SuiteRunner['rootSuites']).toContain(SuiteTest);
    });
  });

  describe('Step', () => {
    class StepTest extends SampleSuite { method1 () { } }

    it('should register a step', () => {
      Step(1)(StepTest.prototype, 'method1');

      const store = SuiteRunner['getConfigStore'](StepTest);

      expect(store.steps[1]).toBe('method1');
    });


    it('should register a step', () => {
      Step(2)(StepTest.prototype, 'method1');
      expect(() => Step(2)(StepTest.prototype, 'method1')).toThrow();
    });
  });

  describe('setConfig', () => {
    it('should be able to set the config', () => {
      class ConfigTest extends SampleSuite { }
      const config = generateConfig();

      SuiteRunner['setConfig'](config.config, ConfigTest);

      expect(SuiteRunner['getConfigStore'](ConfigTest).config).toBe(config.config);
    });
  });

  describe('detectInfiniteLoops', () => {
    it('should be able to detect infinite loops', () => {
      class LoopTestSpec1 extends SampleSuite { }
      class LoopTestSpec2 extends SampleSuite { }
      class LoopTestSpec3 extends SampleSuite { }

      const config1 = generateConfig();
      const config2 = generateConfig();
      const config3 = generateConfig();

      config1.config.dependsOn = [LoopTestSpec2];
      config2.config.dependsOn = [LoopTestSpec3];
      config3.config.dependsOn = [LoopTestSpec1];

      SuiteRunner['setConfigStore'](LoopTestSpec1, config1);
      SuiteRunner['setConfigStore'](LoopTestSpec2, config2);
      SuiteRunner['setConfigStore'](LoopTestSpec3, config3);

      const infiniteLoops = SuiteRunner['detectInfiniteLoops'](LoopTestSpec1);

      expect(infiniteLoops).toEqual([[LoopTestSpec1, LoopTestSpec2, LoopTestSpec3, LoopTestSpec1]]);
    });


    it('should be able to determine non-loops', () => {
      class NonLoopTestSpec1 extends SampleSuite { }
      class NonLoopTestSpec2 extends SampleSuite { }
      class NonLoopTestSpec3 extends SampleSuite { }

      const config1 = generateConfig();
      const config2 = generateConfig();
      const config3 = generateConfig();

      config1.config.dependsOn = [NonLoopTestSpec2];
      config2.config.dependsOn = [NonLoopTestSpec3];
      config3.config.dependsOn = [];

      SuiteRunner['setConfigStore'](NonLoopTestSpec1, config1);
      SuiteRunner['setConfigStore'](NonLoopTestSpec2, config2);
      SuiteRunner['setConfigStore'](NonLoopTestSpec3, config3);

      const infiniteLoops = SuiteRunner['detectInfiniteLoops'](NonLoopTestSpec1);

      expect(infiniteLoops).toEqual([]);
    });
  });
});
