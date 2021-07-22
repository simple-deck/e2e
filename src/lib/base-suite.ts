import { resolve } from 'path/posix';
import { BrowserContext, BrowserType, Page, PageScreenshotOptions } from 'playwright';
import * as mkdirp from 'mkdirp';
import { Browsers } from './typings';
export abstract class BaseSuite<T> implements Partial<Page> {
  private screenshotDirCreated = false;

  protected page!: Page;
  protected browser!: BrowserContext;
  protected browserType!: Browsers;
  abstract main (): Promise<T>;
  abstract hostname: string;

  goto (path: string): ReturnType<Page['goto']> {
    return this.page.goto(this.getCleanURL(path));
  }

  waitForURL (path: string): ReturnType<Page['waitForURL']> {
    const fullURL = this.getCleanURL(path);
    console.log(fullURL);

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
