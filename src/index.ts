import { BaseSuite, run, Suite } from './suite';

type Result = {
  token: string;
  refreshTokenExpiration: string;
  expiration: string;
  refreshToken: string;
  clientIdentifier: string;
};

@Suite({
  dependsOn: []
})
export class SetUp extends BaseSuite<Record<string, string>> {
  async main () {
    await this.page.goto('https://yourcausegrantsqa.com/platform/auth/signin');

    await this.page.waitForURL('https://yourcausegrantsqa.com/platform/home')

    const result: Record<string, string> = await this.page.evaluate(() => {
      const token = JSON.parse(localStorage.getItem('_yc_adminUser') ?? '{}');
      const identifier = localStorage.getItem('_yc_adminClientIdentifier');
      localStorage.setItem('test', 'what in the sam');

      return localStorage;
    });

    return result;
  }
}

@Suite({
  dependsOn: [SetUp] as const
})
export class Login extends BaseSuite<string> {
  constructor (
    private signUpResult: Record<string, string>
  ) { super(); }

  async main () {
    this.page.addInitScript((lsData: any) => {
      Object.assign(localStorage, lsData)
    }, this.signUpResult);

    await this.page.goto('https://yourcausegrantsqa.com/platform/home');
    // await this.page.waitForTimeout(30000);
    await this.page.click('a[aria-label="Grant Managers"]');
    return '';
  }

  private async getMFAFromMailinator () {
    await this.page.goto('https://www.mailinator.com/v4/public/inboxes.jsp?to=lukie');

    await this.page.waitForSelector('table.table-striped.jambo_table > tbody > tr > td:nth-child(3)');

    await this.page.click('table.table-striped.jambo_table > tbody > tr > td:nth-child(3)');
    const el = await this.page.waitForSelector('iframe#html_msg_body');
    const subFrame = await el.contentFrame();
    const content = await subFrame?.$eval('body > center > table:nth-child(3) > tbody > tr:nth-child(4) > td > h1', el => el.innerHTML);
    return content;
  }
}


run();
