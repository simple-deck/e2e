import { BrowserContext, Page } from 'playwright';

export abstract class BaseSuite<T> implements Partial<Page> {
  protected page!: Page;
  protected browser!: BrowserContext;
  abstract main (): Promise<T>;
  abstract hostname: string;

  goto (path: string) {
    return this.page.goto(this.getCleanURL(path));
  }

  waitForURL (path: string) {
    const fullURL = this.getCleanURL(path);
    console.log(fullURL);
    return this.page.waitForURL(fullURL);
  }

  private getCleanURL (path: string): string {
    return `${this.hostname}${path}`.replace(/(https?:\/\/)|(\/)+/g, "$1$2");
  }

  url () {
    return this.page.url().replace(this.getCleanURL('/'), '')
  }

  /**
   * 
   * @param label Label of the control (selects based on the aria label of the ng-select)
   * @param optionSelector Option selector
   */
  async selectNgOption (label: string, optionSelector: `:has-text("${string}")`|`:nth-of-type(${number})`) {
    const baseSelector = `ng-select[aria-label="${label}"]`;
    await this.page.click(baseSelector); // open dropdown
    await this.page.click(`${baseSelector} div.ng-option[role="option"]${optionSelector}`); // click option based on selector
  }

  async waitForToastr (type: 'success'|'warning'|'error') {
    await this.page.waitForSelector('#toast-container > .toast-' + type);
  }
}
