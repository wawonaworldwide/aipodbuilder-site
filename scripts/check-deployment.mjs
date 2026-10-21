import {
  deploymentIssues,
  readDeploymentConfig,
} from './deployment-config.mjs';
try {
  const issues = deploymentIssues(process.argv[2], readDeploymentConfig());
  if (issues.length) {
    console.error('Deployment setup still needs:');
    for (const issue of issues) console.error('- ' + issue);
    process.exitCode = 1;
  } else
    console.log(
      'Public deployment configuration checks pass. No account connection or stored credential verification was performed. Complete the manual checks in DEPLOY.md.',
    );
} catch {
  console.error('Choose preview or production. No private values read.');
  process.exitCode = 1;
}
