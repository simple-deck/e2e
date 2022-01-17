import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Stores the set on the disk, should only be used on primitives
 */
export class CachedMap<K extends string|number|symbol, V> extends Map<K, V>{
  
  constructor (
    private diskLocation: string
  ) {
    super(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(CachedMap.initLocation(diskLocation)) as any
    );

    this.writeResult();

    this.clear = () => {
      super.clear();
      this.writeResult();
    };


    this.set = (...args) => {
      super.set(...args);
      this.writeResult();

      return this;
    };

    this.delete = (key) => {
      const r = super.delete(key);
      this.writeResult();

      return r;
    };
  }

  static initLocation<K extends (string|number|symbol), V> (location: string): Record<K, V> {
    const cacheExists = existsSync(location);

    if (!cacheExists) {
      return {} as Record<K, V>;
    } else {
      const dataFromDisk = readFileSync(location).toString();

      return JSON.parse(dataFromDisk);
    }
  }

  private writeResult () {
    writeFileSync(this.diskLocation, JSON.stringify(Object.fromEntries(this)));
  }
}
