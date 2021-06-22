import { BaseSuite, run, Suite } from './suite';

@Suite({
  dependsOn: []
})
export class SignUp extends BaseSuite<string> {
  async main () {
    await this.page.goto('https://google.com');

    console.log(await this.page.evaluate(() => {
      localStorage.setItem('test', 'what in the sam');

      return localStorage.getItem('test');
    }));

    return 'I went to google';
  }
}

@Suite({
  dependsOn: [SignUp]
})
export class Login extends BaseSuite<string> {
  async main () {
    await this.page.goto('https://google.com');

    const whatItIs = await this.page.evaluate(() => localStorage.getItem('test'));

    console.log(whatItIs);

    return 'I went back to google';
  }
}


run();
