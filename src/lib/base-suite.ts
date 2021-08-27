import * as mkdirp from 'mkdirp';
import { resolve } from 'path';
import { BrowserContext, Page } from 'playwright';
import { Browsers } from './typings';

/**
 * The core suite is a runner that runs each suite with `Step`. Requires at least one `Step` to be present
 * 
 * See {@link SuiteRunner.Step}
 */
export abstract class CoreSuite implements Partial<Page> {
  private screenshotDirCreated = false;

  protected page!: Page;
  protected browser!: BrowserContext;
  protected browserType!: Browsers;
  abstract hostname: string;

  goto (path: string): ReturnType<Page['goto']> {
    return this.page.goto(this.getCleanURL(path));
  }

  waitForURL (path: string): ReturnType<Page['waitForURL']> {
    const fullURL = this.getCleanURL(path);

    return this.page.waitForURL(fullURL);
  }

  private getCleanURL (path: string): string {
    return `${this.hostname}${path}`.replace(/(https?:\/\/)|(\/)+/g, "$1$2");
  }

  url (): string {
    return this.page.url().replace(this.getCleanURL('/'), '');
  }

  /**
   * 
   * @param label Label of the control (selects based on the aria label of the ng-select)
   * @param optionSelector Option selector
   */
  async selectNgOption (label: string, optionSelector: `:has-text("${string}")`|`:nth-of-type(${number})`): Promise<void> {
    const baseSelector = `ng-select[aria-label="${label}"]`;
    await this.page.click(baseSelector); // open dropdown
    await this.page.click(`${baseSelector} div.ng-option[role="option"]${optionSelector}`); // click option based on selector
  }

  async waitForToastr (type: 'success'|'warning'|'error'): Promise<void> {
    await this.page.waitForSelector('#toast-container > .toast-' + type);
  }

  /**
   * Take a screenshot and store in a relative, browser specific folder
   * 
   * @param name Name of the file to store the screenshot
   */
  async screenshotPage (name: string): Promise<void> {
    const folder = resolve(process.cwd(), 'screenshots', this.browserType);
    if (!this.screenshotDirCreated) {
      mkdirp.sync(folder);
    }

    await this.page.screenshot({
      path: resolve(folder, name)
    });
  }
}

/**
 * An extension of the {@link CoreSuite}. No {@link SuiteRunner.Step} required for this, the {@link BaseSuite#main} method will automatically be called.
 */
export abstract class BaseSuite<T> extends CoreSuite {
  /**
   * The core method of the suite, the return value is used to pass data to another suite
   */
  abstract main (): T|Promise<T>;
}

class TestBaseSuite extends BaseSuite<void> {
  async main () {
    return;
  }
  hostname = '';
}
export const testBaseSuite = new TestBaseSuite();
