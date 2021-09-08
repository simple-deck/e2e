import { ResultsProcessor } from './results-processor';
import { TestResult } from './typings';

describe(ResultsProcessor, () => {
  it('should be able to generate junit', async () => {
    const processor = new ResultsProcessor();
    
    const results: TestResult<unknown>[] = [{
      time: 5,
      specs: [{
        specName: 'Spec 1',
        success: true,
        time: 1
      }, {
        specName: 'Spec 2',
        success: true,
        time: 1
      }],
      result: null,
      success: true,
      suiteName: 'Suite 1'
    }, {
      time: 5,
      specs: [{
        specName: 'Spec 1',
        success: true,
        time: 1
      }, {
        specName: 'Spec 2',
        success: false,
        error: 'error in spec 2',
        time: 1
      }],
      result: null,
      success: false,
      suiteName: 'Suite 1'
    }];

    const expected = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<testsuites id="@simple-deck/e2e-runner" name="@simple-deck/e2e-runner" tests="4" failures="1" time="0">
  <testsuite id="Suite 1" name="Suite 1" tests="2" failures="0" time="5">
    <testcase id="Suite 1#Spec 1" name="Spec 1" time="1"/>
    <testcase id="Suite 1#Spec 2" name="Spec 2" time="1"/>
  </testsuite>
  <testsuite id="Suite 1" name="Suite 1" tests="2" failures="1" time="5">
    <testcase id="Suite 1#Spec 1" name="Spec 1" time="1"/>
    <testcase id="Suite 1#Spec 2" name="Spec 2" time="1">
      <failure message="error in spec 2">error in spec 2</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const xml = await processor['writeResultsAsJUnit'](results, 0);

    expect(xml).toEqual(expected);
  });
});
