import { expect } from 'chai';
import { ElementHandle } from 'playwright';
import { CoreSuite, Step, Suite } from '../../lib';
@Suite({
  dependsOn: [],
  disabled: false
})
export class Google extends CoreSuite {
  imageButton: ElementHandle<HTMLElement|SVGElement>|null = null;
  hostname = 'https://google.com';

  @Step(1)
  async testMainPage (): Promise<void> {
    await this.goto('/');

    const title = await this.page.title();

    expect(title).to.match(/Google/);

    this.imageButton = await this.page.$('a:has-text("Image")');

    expect(this.imageButton).not.to.be.undefined;
  }

  @Step(2)
  async testImages (): Promise<void> {
    await this.imageButton!.click();

    const title = await this.page.title();

    expect(title).to.match(/Images/);
  }
}
