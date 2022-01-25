import { BaseSuite } from './base-suite';
import { SuiteRunner } from './suite-runner';
import { Browsers, StepError, SuiteStorage } from './typings';

const suite = 'suite';

const generateResult = () => ({
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

      // longest starts first
      const promise1 = new Promise<void>((r) => setTimeout(() => r(), 5));
      const promise2 = new Promise<void>((r) => setTimeout(() => r(), 3));
      const promise3 = new Promise<void>((r) => setTimeout(() => r(), 1));
      const promise4 = new Promise<void>((r) => setTimeout(() => r()));

      const results: string[] = [];

      suiteRunner['runSuiteInMain'] = async (suiteName: string) => {
        switch (suiteName) {
          case suite1Isolate.name:
            await promise1;
            break;
          case suite2Isolate.name:
            await promise2;
            break;
          case suite3Concurrent.name:
            await promise3;
            break;
          case suite4Concurrent.name:
            await promise4;
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
});
