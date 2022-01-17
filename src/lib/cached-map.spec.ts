import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { CachedMap } from './cached-map';

describe(CachedMap, () => {
  const fileLocation = resolve(__dirname, 'cache');

  describe('disk ops', () => {
    it('should be able to set up a new cache', () => {
      new CachedMap(fileLocation);
      
      const fileExists2 = existsSync(fileLocation);
      
      expect(fileExists2).toBe(true);
      
      const fileContents = readFileSync(fileLocation);
      
      expect(fileContents.toString()).toBe('{}');
    });
    
    it('should be able to use an existing cache', () => {
      const expectedValue = 1;
      const expectedKey = 'a';
      writeFileSync(fileLocation, `{"${expectedKey}":${expectedValue}}`);
  
      const set = new CachedMap(fileLocation);
  
      expect(set.get(expectedKey)).toBe(expectedValue);
    });
  });

  describe('standard set ops', () => {
    let set: CachedMap<string, number>;

    beforeEach(() => {
      set = new CachedMap<string, number>(fileLocation);
    });
    function verifyEquals () {
      const diskContents = readFileSync(fileLocation).toString();
      expect(diskContents).toBe(JSON.stringify(Object.fromEntries(set)));
    }


    it('should support #set', () => {
      const key = 'test';
      const value = 1;
      expect(set.get(key)).toBeUndefined();

      set.set(key, value);

      expect(set.get(key)).toEqual(value);
    });

    it('should support #delete', () => {
      const key = 'test';
      const value = 1;
      expect(set.get(key)).toBeUndefined();
      
      set.set(key, value);
      
      expect(set.get(key)).toEqual(value);
      
      set.delete(key);

      expect(set.get(key)).toBeUndefined();
    });


    it('should support #clear', () => {
      const key = 'test';
      const value = 1;
      expect(set.get(key)).toBeUndefined();

      set.set(key, value);

      expect(set.get(key)).toEqual(value);

      set.clear();

      expect(set.get(key)).toEqual(undefined);
    });

    afterEach(() => {
      verifyEquals();
      rmSync(fileLocation);
    });
  });

  afterAll(() => {
    rmSync(fileLocation);
  });
});
