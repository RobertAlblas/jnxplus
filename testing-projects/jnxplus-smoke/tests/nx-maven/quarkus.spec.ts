import { uniq } from '@nx/plugin/testing';
import { readJson } from 'fs-extra';

import { execSync, ExecSyncOptions } from 'child_process';
import { join } from 'path';

import { dirSync } from 'tmp';

let smokeDirectory: string;
let cleanup: () => void;

const execSyncOptions: () => ExecSyncOptions = () => ({
  cwd: join(smokeDirectory, 'test'),
  env: {
    ...process.env,
    GIT_COMMITTER_NAME: 'Smoke Test CI',
    GIT_COMMITTER_EMAIL: 'no-reply@fake.com',
    GIT_AUTHOR_NAME: 'Smoke Test CI',
    GIT_AUTHOR_EMAIL: 'no-reply@fake.com',
  },
  stdio: 'inherit',
});

const libsParentProject = uniq('libs-parent-project-');
const appsParentProject = uniq('apps-parent-project-');

const testApp = uniq('test-app-');
const testLib = uniq('test-lib-');

const testApp2 = uniq('test-app2-');
const testLib2 = uniq('test-lib2-');
const testApp3 = uniq('test-app3-');
const testApp4 = uniq('test-app4-');
const testApp5 = uniq('test-app5-');
const testLib5 = uniq('test-lib5-');
const testApp6 = uniq('test-app6-');

describe('nx-maven quarkus smoke', () => {
  beforeEach(async () => {
    ({ name: smokeDirectory, removeCallback: cleanup } = dirSync({
      unsafeCleanup: true,
    }));
  });

  afterEach(async () => {
    cleanup();
  });

  it('should work', async () => {
    execSync(
      'npx create-nx-workspace@latest test --preset empty --nxCloud false',
      {
        cwd: smokeDirectory,
        env: process.env,
        stdio: 'inherit',
      },
    );

    execSync('git init', execSyncOptions());

    execSync('npm i --save-dev @jnxplus/nx-maven', execSyncOptions());

    execSync('npx nx generate @jnxplus/nx-maven:init', execSyncOptions());

    execSync(
      `npx nx generate @jnxplus/nx-maven:parent-project ${libsParentProject} --projectType library --framework quarkus`,
      execSyncOptions(),
    );

    execSync(
      `npx nx generate @jnxplus/nx-maven:parent-project ${appsParentProject} --parentProject ${libsParentProject} --framework none`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp} --framework quarkus --parentProject ${appsParentProject}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:lib ${testLib} --framework quarkus --parentProject ${libsParentProject} --projects ${testApp}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp2} --framework quarkus --parentProject ${appsParentProject}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp3} --framework quarkus --parentProject ${appsParentProject}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp4} --framework quarkus --parentProject ${appsParentProject}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:lib ${testLib2} --framework quarkus --parentProject ${libsParentProject} --projects ${testApp2},${testApp3},${testApp4}`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp5} --parentProject ${appsParentProject} --framework quarkus --language kotlin`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:application ${testApp6} --parentProject ${appsParentProject} --framework quarkus --language kotlin`,
      execSyncOptions(),
    );

    execSync(
      `npx nx g @jnxplus/nx-maven:lib ${testLib5} --parentProject ${libsParentProject} --framework quarkus --language kotlin --projects ${testApp5},${testApp6}`,
      execSyncOptions(),
    );

    execSync(`npx nx test ${testLib}`, execSyncOptions());

    execSync(`npx nx run-many --target=build --parallel=1`, execSyncOptions());

    execSync(`npx nx graph --file=dep-graph.json`, execSyncOptions());

    const depGraphJson = await readJson(
      join(smokeDirectory, 'test', 'dep-graph.json'),
    );
    expect(depGraphJson.graph.nodes[testApp]).toBeDefined();
    expect(depGraphJson.graph.nodes[testLib]).toBeDefined();

    expect(depGraphJson.graph.dependencies[testApp]).toContainEqual({
      type: 'static',
      source: testApp,
      target: testLib,
    });

    execSync(`git commit -am "chore: scaffold projects"`, execSyncOptions());
  }, 1500000);
});
