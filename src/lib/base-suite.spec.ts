import { BaseSuite } from './base-suite';

describe(BaseSuite, () => {
  const hostname = 'test.com';
  class MySuite extends BaseSuite<void> {
    hostname = hostname;
    async main () {
      return;
    }
  }
  it('should be able to generate a url', () => {
    const suite = new MySuite();

    const path = '/path';
    const cleanUrl = suite['getCleanURL'](path);

    expect(cleanUrl).toContain(hostname);
    expect(path).toContain(path);
  });
});
