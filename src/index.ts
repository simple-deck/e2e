import { run, Suite } from './suite';

class SignUp {

}

class Login {

}

Suite({ dependsOn: [] })(SignUp)
Suite({ dependsOn: [SignUp] })(Login)

run();
