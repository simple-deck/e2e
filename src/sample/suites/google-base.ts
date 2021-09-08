import { expect } from 'chai';
import { ElementHandle } from 'playwright';
import { BaseSuite, Suite } from '../../lib';
@Suite({
  dependsOn: [],
  disabled: false
})
export class GoogleBase extends BaseSuite<void> {
  imageButton: ElementHandle<HTMLElement|SVGElement>|null = null;
  hostname = 'https://google.com';

  async main (): Promise<void> {
    await this.goto('/');

    const defaultTitle = await this.page.title();

    expect(defaultTitle).to.match(/Google/);

    this.imageButton = await this.page.$('a:has-text("Image")');

    expect(this.imageButton).not.to.be.undefined;

    await this.imageButton?.click();

    await this.page.waitForNavigation();

    const imagesTitle = await this.page.title();

    expect(imagesTitle).to.match(/Images/);
  }
}
