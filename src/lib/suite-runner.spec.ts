import { SuiteRunner } from './suite-runner';
import { StepError } from './typings';

describe(SuiteRunner, () => {
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
