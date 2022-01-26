import { CoreSuite } from './base-suite';
import { SuiteRunnerStorage } from './suite-runner-storage';
import { generateConfig, SampleSuite } from './test-helpers';
import { StepError } from './typings';


describe(SuiteRunnerStorage, () => {
  let suiteRunnerStorage: SuiteRunnerStorage;
  beforeEach(() => {
    suiteRunnerStorage = new SuiteRunnerStorage();
    suiteRunnerStorage.configStorage.clear();
    suiteRunnerStorage.sharedSuiteStorage.clear();
    suiteRunnerStorage.suiteResultStorage.clear();
    suiteRunnerStorage.dependencyStorage.clear();
    suiteRunnerStorage.rootSuites = [];

    jest.clearAllMocks();
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

      suiteRunnerStorage.setConfigStore(LoopTestSpec1, config1);
      suiteRunnerStorage.setConfigStore(LoopTestSpec2, config2);
      suiteRunnerStorage.setConfigStore(LoopTestSpec3, config3);

      const infiniteLoops = suiteRunnerStorage['detectInfiniteLoops'](LoopTestSpec1);

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

      suiteRunnerStorage.setConfigStore(NonLoopTestSpec1, config1);
      suiteRunnerStorage.setConfigStore(NonLoopTestSpec2, config2);
      suiteRunnerStorage.setConfigStore(NonLoopTestSpec3, config3);

      const infiniteLoops = suiteRunnerStorage['detectInfiniteLoops'](NonLoopTestSpec1);

      expect(infiniteLoops).toEqual([]);
    });
  });


  describe('setConfig', () => {
    it('should be able to set the config', () => {
      class ConfigTest extends SampleSuite { }
      const config = generateConfig();

      suiteRunnerStorage.setConfig(config.config, ConfigTest);

      expect(suiteRunnerStorage.getConfigStore(ConfigTest).config).toBe(config.config);
    });
  });


  describe('registerStep', () => {
    class StepTest extends SampleSuite {
      method1 () { /* empty */ }
    }

    it('should register a step', () => {
      suiteRunnerStorage.registerStep(1, StepTest.prototype, 'method1');

      const store = suiteRunnerStorage.getConfigStore(StepTest);

      expect(store.steps[1]).toBe('method1');
    });


    it('should throw when registering a step in an existing step', () => {
      suiteRunnerStorage.registerStep(2, StepTest.prototype, 'method1');
      expect(() => suiteRunnerStorage.registerStep(2, StepTest.prototype, 'method1')).toThrow();
    });
  });


  describe('registerSuite', () => {
    class SuiteTest extends SampleSuite { }

    class SampleCoreSuite extends CoreSuite {
      hostname = '';
    }

    it('should ignore disabled suites', () => {
      suiteRunnerStorage.registerSuite({
        disabled: true,
        dependsOn: []
      }, SuiteTest);

      expect(suiteRunnerStorage['configStorage'].get(SuiteTest.name)).toBe(undefined);
    });


    it('should throw on already registered suites', () => {
      suiteRunnerStorage.registerSuite({
        dependsOn: []
      }, SuiteTest);

      expect(() => suiteRunnerStorage.registerSuite({ dependsOn: [] }, SuiteTest)).toThrow();
    });

    it('should recognize root suites', () => {
      suiteRunnerStorage.registerSuite({
        dependsOn: []
      }, SuiteTest);

      expect(suiteRunnerStorage['rootSuites']).toContain(SuiteTest.name);
    });

    it('should throw errors when infinite loops are detected', () => {
      const _detectInfiniteLoop = suiteRunnerStorage['detectInfiniteLoops'];

      suiteRunnerStorage['detectInfiniteLoops'] = () => [[]];

      expect(() => suiteRunnerStorage.registerSuite({ dependsOn: [] }, SuiteTest)).toThrow();

      suiteRunnerStorage['detectInfiniteLoops'] = _detectInfiniteLoop;
    });

    it('should throw errors when infinite loops are detected', () => {
      const _detectInfiniteLoop = suiteRunnerStorage['detectInfiniteLoops'];

      suiteRunnerStorage['detectInfiniteLoops'] = () => [[]];

      expect(() => suiteRunnerStorage.registerSuite({ dependsOn: [] }, SuiteTest)).toThrow();

      suiteRunnerStorage['detectInfiniteLoops'] = _detectInfiniteLoop;
    });


    it('should validate steps when not using a BaseSuite', () => {

      const _validateStepPresence = suiteRunnerStorage['validateStepPresence'];

      let called = false;
      suiteRunnerStorage['validateStepPresence'] = () => {
        called = true;

        return '';
      };

      suiteRunnerStorage.registerSuite({ dependsOn: [] }, SampleCoreSuite);

      expect(called).toBeTruthy();

      suiteRunnerStorage['validateStepPresence'] = _validateStepPresence;
    });


    it('should throw an error if the step presence returns an error', () => {
      const _validateStepPresence = suiteRunnerStorage['validateStepPresence'];

      suiteRunnerStorage['validateStepPresence'] = () => {
        return 'Error';
      };

      expect(() => suiteRunnerStorage.registerSuite({ dependsOn: [] }, SampleCoreSuite)).toThrow();

      suiteRunnerStorage['validateStepPresence'] = _validateStepPresence;
    });

    it('should register dependencies correctly', () => {
      suiteRunnerStorage.registerSuite({ dependsOn: [SampleCoreSuite] }, SampleSuite);

      expect(suiteRunnerStorage['dependencyStorage'].get(SampleCoreSuite.name)).toContain(SampleSuite.name);
    });
  });


  describe('validateStepPresence', () => {

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
      const validationResult = suiteRunnerStorage['validateStepPresence'](validSteps);

      expect(validationResult).toEqual('');
    });

    it('should be able to invalidate empty steps', () => {
      const validationResult = suiteRunnerStorage['validateStepPresence'](noSteps);

      expect(validationResult).toEqual(StepError.noSteps);
    });

    it('should be able to invalidate missing steps', () => {
      const validationResult = suiteRunnerStorage['validateStepPresence'](missingStep);

      expect(validationResult.startsWith(StepError.missingStep)).toBeTruthy();
    });


    it('should be able to invalidate methods with multiple step numbers', () => {
      const validationResult = suiteRunnerStorage['validateStepPresence'](duplicateStep);

      expect(validationResult.startsWith(StepError.methodOnMultipleSteps)).toBeTruthy();
    });
  });
});
