import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as xml2js from 'xml2js';
import { TestResult, TestResultsProcessor } from './typings';

export class ResultsProcessor {
  async writeResults (
    type: TestResultsProcessor,
    results: TestResult<unknown>[],
    overallTime: number,
    location: string
  ): Promise<void> {
    switch (type) {
      case TestResultsProcessor.JUnit: {
        const result = await this.writeResultsAsJUnit(results, overallTime);
    
        writeFileSync(location, result);
        break;
      }
    }
  }

  private async writeResultsAsJUnit (
    results: TestResult<unknown>[],
    overallTime: number
  ): Promise<string> {
    const builder = new xml2js.Builder();
    const packageLocation = resolve(process.cwd(), 'package.json');
    const packageRaw = readFileSync(packageLocation).toString();
    const packageJson = JSON.parse(packageRaw);

    const failures = results.reduce((failureCount, result) => {
      return failureCount + result.specs.filter(spec => spec.success === false).length;
    }, 0);

    const root = builder.buildObject({
      testsuites: {
        $: {
          id: packageJson.name,
          name: packageJson.name,
          tests: results.reduce((acc, result) => acc + result.specs.length, 0),
          failures,
          time: overallTime
        },
        testsuite: results.map(result => {
          return {
            $: {
              id: result.suiteName,
              name: result.suiteName,
              tests: result.specs.length,
              failures: result.specs.filter(spec => !spec.success).length,
              time: result.time
            },
            testcase: result.specs.map(spec => {
              return {
                $: {
                  id: result.suiteName + '#' + spec.specName,
                  name: spec.specName,
                  time: spec.time
                },
                failure: spec.success ? [] : [{
                  $: {
                    message: spec.error
                  },
                  _: spec.error
                }]
              };
            })
          };
        })
      }
    });

    return root;
  }
}
