import { names } from '@nrwl/devkit';
import {
  checkFilesExist,
  cleanup,
  patchPackageJsonForPlugin,
  readFile,
  readJson,
  runNxCommandAsync,
  runPackageManagerInstall,
  tmpProjPath,
  uniq,
  updateFile,
} from '@nrwl/nx-plugin/testing';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as fs from 'fs';

import {
  killPorts,
  promisifiedTreeKill,
  runNxCommandUntil,
  runNxNewCommand,
  normalizeName,
} from './e2e-utils';

describe('nx-quarkus-gradle e2e', () => {
  const isCI =
    process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const isWin = process.platform === 'win32';
  const isMacOs = process.platform === 'darwin';
  beforeEach(async () => {
    fse.ensureDirSync(tmpProjPath());
    cleanup();
    runNxNewCommand('', true);

    patchPackageJsonForPlugin(
      '@jnxplus/nx-quarkus-gradle',
      'dist/packages/nx-quarkus-gradle'
    );
    patchPackageJsonForPlugin(
      'prettier-plugin-java',
      'node_modules/prettier-plugin-java'
    );
    patchPackageJsonForPlugin(
      '@jnxplus/checkstyle',
      'node_modules/@jnxplus/checkstyle'
    );
    patchPackageJsonForPlugin('@jnxplus/pmd', 'node_modules/@jnxplus/pmd');
    patchPackageJsonForPlugin(
      '@jnxplus/ktlint',
      'node_modules/@jnxplus/ktlint'
    );
    runPackageManagerInstall();

    if (isCI) {
      const filePath = `${process.cwd()}/.gitignore`;
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const updatedFileContent = fileContent.replace('/tmp', '');
      fs.writeFileSync(filePath, updatedFileContent);
    }
  }, 1200000);

  afterAll(() => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    runNxCommandAsync('reset');
  });

  it('should init the workspace with @jnxplus/nx-quarkus-gradle capabilities', async () => {
    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    // Making sure the package.json file contains the @jnxplus/nx-quarkus-gradle dependency
    const packageJson = readJson('package.json');
    expect(
      packageJson.devDependencies['@jnxplus/nx-quarkus-gradle']
    ).toBeTruthy();

    // Making sure the nx.json file contains the @jnxplus/nx-quarkus-gradle inside the plugins section
    const nxJson = readJson('nx.json');
    expect(nxJson.plugins.includes('@jnxplus/nx-quarkus-gradle')).toBeTruthy();

    expect(() =>
      checkFilesExist(
        'gradle/wrapper/gradle-wrapper.jar',
        'gradle/wrapper/gradle-wrapper.properties',
        'gradlew',
        'gradlew.bat',
        'gradle.properties',
        'settings.gradle',
        'tools/linters/checkstyle.xml'
      )
    ).not.toThrow();
  }, 1200000);

  it('should use dsl option when initiating the workspace', async () => {
    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    // Making sure the package.json file contains the @jnxplus/nx-quarkus-gradle dependency
    const packageJson = readJson('package.json');
    expect(
      packageJson.devDependencies['@jnxplus/nx-quarkus-gradle']
    ).toBeTruthy();

    // Making sure the nx.json file contains the @jnxplus/nx-quarkus-gradle inside the plugins section
    const nxJson = readJson('nx.json');
    expect(nxJson.plugins.includes('@jnxplus/nx-quarkus-gradle')).toBeTruthy();

    expect(() =>
      checkFilesExist(
        'gradle/wrapper/gradle-wrapper.jar',
        'gradle/wrapper/gradle-wrapper.properties',
        'gradlew',
        'gradlew.bat',
        'gradle.properties',
        'settings.gradle.kts',
        'tools/linters/checkstyle.xml'
      )
    ).not.toThrow();
  }, 1200000);

  it('should migrate', async () => {
    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);
    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:migrate`);
  }, 1200000);

  it('should create an java application', async () => {
    const appName = uniq('quarkus-gradle-app-');

    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${appName}`
    );

    expect(() =>
      checkFilesExist(
        `apps/${appName}/build.gradle`,
        `apps/${appName}/src/main/resources/application.properties`,

        `apps/${appName}/src/main/java/org/acme/${names(
          appName
        ).className.toLocaleLowerCase()}/GreetingResource.java`,
        `apps/${appName}/src/test/java/org/acme/${names(
          appName
        ).className.toLocaleLowerCase()}/GreetingResourceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`apps/${appName}/build.gradle`);
    expect(buildGradle.includes('org.acme')).toBeTruthy();
    expect(buildGradle.includes('0.0.1-SNAPSHOT')).toBeTruthy();

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    //should recreate build folder
    const localTmpDir = path.dirname(tmpProjPath());
    const targetDir = path.join(localTmpDir, 'proj', 'apps', appName, 'build');
    fse.removeSync(targetDir);
    expect(() => checkFilesExist(`apps/${appName}/build`)).toThrow();
    await runNxCommandAsync(`build ${appName}`);
    expect(() => checkFilesExist(`apps/${appName}/build`)).not.toThrow();

    if (!isWin && !isMacOs) {
      const buildImageResult = await runNxCommandAsync(
        `build-image ${appName}`
      );
      expect(buildImageResult.stdout).toContain('Executor ran for Build Image');
    }

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${appName}`
    );
    expect(formatResult.stdout).toContain('');

    const process = await runNxCommandUntil(`serve ${appName}`, (output) =>
      output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }

    //test run-task
    const projectJson = readJson(`apps/${appName}/project.json`);
    projectJson.targets = {
      ...projectJson.targets,
      'run-task': {
        executor: '@jnxplus/nx-quarkus-gradle:run-task',
      },
    };
    updateFile(`apps/${appName}/project.json`, JSON.stringify(projectJson));
    const runTaskResult = await runNxCommandAsync(
      `run-task ${appName} --task="test"`
    );
    expect(runTaskResult.stdout).toContain('Executor ran for Run Task');
    //end test run-task
  }, 1200000);

  it('should use specified options to create an application', async () => {
    const randomName = uniq('quarkus-gradle-app-');
    const appDir = 'deep/subdir';
    const appName = `${normalizeName(appDir)}-${randomName}`;

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${randomName} --tags e2etag,e2ePackage --directory ${appDir} --groupId com.jnxplus --projectVersion 1.2.3 --configFormat .yml`
    );

    expect(() =>
      checkFilesExist(
        `apps/${appDir}/${randomName}/build.gradle`,
        `apps/${appDir}/${randomName}/src/main/resources/application.yml`,
        `apps/${appDir}/${randomName}/src/main/java/com/jnxplus/deep/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResource.java`,
        `apps/${appDir}/${randomName}/src/test/java/com/jnxplus/deep/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResourceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`apps/${appDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`apps/${appDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${appName}`
    );
    expect(formatResult.stdout).toContain('');

    //graph
    const depGraphResult = await runNxCommandAsync(
      `dep-graph --file=dep-graph.json`
    );
    expect(depGraphResult.stderr).not.toContain(
      'Failed to process the project graph'
    );

    const process = await runNxCommandUntil(
      `serve ${appName} --args="-Dquarkus-profile=prod"`,
      (output) => output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }
  }, 1200000);

  it('should generate an app with a simple package name', async () => {
    const randomName = uniq('quarkus-gradle-app-');
    const appDir = 'deep/subdir';
    const appName = `${normalizeName(appDir)}-${randomName}`;

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${randomName} --tags e2etag,e2ePackage --directory ${appDir} --groupId com.jnxplus --packageNameType short --projectVersion 1.2.3 --configFormat .yml`
    );

    expect(() =>
      checkFilesExist(
        `apps/${appDir}/${randomName}/build.gradle`,
        `apps/${appDir}/${randomName}/src/main/resources/application.yml`,
        `apps/${appDir}/${randomName}/src/main/java/com/jnxplus/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResource.java`,
        `apps/${appDir}/${randomName}/src/test/java/com/jnxplus/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResourceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good informations
    const buildGradle = readFile(`apps/${appDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`apps/${appDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${appName}`
    );
    expect(formatResult.stdout).toContain('');

    const process = await runNxCommandUntil(
      `serve ${appName} --args="-Dquarkus-profile=prod"`,
      (output) => output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }
  }, 1200000);

  it('should create an kotlin application', async () => {
    const appName = uniq('quarkus-gradle-app-');

    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${appName} --language kotlin`
    );

    expect(() =>
      checkFilesExist(
        `apps/${appName}/build.gradle.kts`,
        `apps/${appName}/src/main/resources/application.properties`,
        `apps/${appName}/src/main/kotlin/org/acme/${names(
          appName
        ).className.toLocaleLowerCase()}/GreetingResource.kt`,
        `apps/${appName}/src/test/kotlin/org/acme/${names(
          appName
        ).className.toLocaleLowerCase()}/GreetingResourceTest.kt`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`apps/${appName}/build.gradle.kts`);
    expect(buildGradle.includes('org.acme')).toBeTruthy();
    expect(buildGradle.includes('0.0.1-SNAPSHOT')).toBeTruthy();

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    //should recreate build folder
    const localTmpDir = path.dirname(tmpProjPath());
    const targetDir = path.join(localTmpDir, 'proj', 'apps', appName, 'build');
    fse.removeSync(targetDir);
    expect(() => checkFilesExist(`apps/${appName}/build`)).toThrow();
    await runNxCommandAsync(`build ${appName}`);
    expect(() => checkFilesExist(`apps/${appName}/build`)).not.toThrow();

    if (!isWin && !isMacOs) {
      const buildImageResult = await runNxCommandAsync(
        `build-image ${appName}`
      );
      expect(buildImageResult.stdout).toContain('Executor ran for Build Image');
    }

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const formatResult = await runNxCommandAsync(`ktformat ${appName}`);
    expect(formatResult.stdout).toContain('Executor ran for Kotlin Format');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const process = await runNxCommandUntil(`serve ${appName}`, (output) =>
      output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }
  }, 1200000);

  it('--an app with aliases', async () => {
    const randomName = uniq('quarkus-gradle-app-');
    const appDir = 'subdir';
    const appName = `${appDir}-${randomName}`;

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    await runNxCommandAsync(
      `g @jnxplus/nx-quarkus-gradle:app ${randomName} --t e2etag,e2ePackage --dir ${appDir} --groupId com.jnxplus --v 1.2.3 --configFormat .yml`
    );

    expect(() =>
      checkFilesExist(
        `apps/${appDir}/${randomName}/build.gradle`,
        `apps/${appDir}/${randomName}/src/main/resources/application.yml`,
        `apps/${appDir}/${randomName}/src/main/java/com/jnxplus/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResource.java`,
        `apps/${appDir}/${randomName}/src/test/java/com/jnxplus/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingResourceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`apps/${appDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`apps/${appDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${appName}`
    );
    expect(formatResult.stdout).toContain('');

    const process = await runNxCommandUntil(
      `serve ${appName} --args="-Dquarkus-profile=prod"`,
      (output) => output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }
  }, 1200000);

  it('directory with dash', async () => {
    const appName = uniq('quarkus-gradle-app-');

    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${appName} --directory deep/sub-dir`
    );

    const process = await runNxCommandUntil(
      `serve deep-sub-dir-${appName}`,
      (output) => output.includes(`Listening on: http://localhost:8080`)
    );

    // port and process cleanup
    try {
      await promisifiedTreeKill(process.pid, 'SIGKILL');
      await killPorts(8080);
    } catch (err) {
      expect(err).toBeFalsy();
    }
  }, 1200000);

  it('should create a library', async () => {
    const libName = uniq('quarkus-gradle-lib-');

    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${libName}`
    );

    expect(() =>
      checkFilesExist(
        `libs/${libName}/build.gradle`,
        `libs/${libName}/src/main/java/org/acme/${names(
          libName
        ).className.toLocaleLowerCase()}/GreetingService.java`,
        `libs/${libName}/src/test/java/org/acme/${names(
          libName
        ).className.toLocaleLowerCase()}/GreetingServiceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`libs/${libName}/build.gradle`);
    expect(buildGradle.includes('org.acme')).toBeTruthy();
    expect(buildGradle.includes('0.0.1-SNAPSHOT')).toBeTruthy();

    const buildResult = await runNxCommandAsync(`build ${libName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    //should recreate build folder
    const localTmpDir = path.dirname(tmpProjPath());
    const targetDir = path.join(localTmpDir, 'proj', 'libs', libName, 'build');
    fse.removeSync(targetDir);
    expect(() => checkFilesExist(`libs/${libName}/build`)).toThrow();
    await runNxCommandAsync(`build ${libName}`);
    expect(() => checkFilesExist(`libs/${libName}/build`)).not.toThrow();

    const testResult = await runNxCommandAsync(`test ${libName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${libName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${libName}`
    );
    expect(formatResult.stdout).toContain('');
  }, 1200000);

  it('should create a kotlin library', async () => {
    const libName = uniq('quarkus-gradle-lib-');

    await runNxCommandAsync(`generate @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${libName} --language kotlin`
    );

    expect(() =>
      checkFilesExist(
        `libs/${libName}/build.gradle.kts`,
        `libs/${libName}/src/main/kotlin/org/acme/${names(
          libName
        ).className.toLocaleLowerCase()}/GreetingService.kt`,
        `libs/${libName}/src/test/kotlin/org/acme/${names(
          libName
        ).className.toLocaleLowerCase()}/GreetingServiceTest.kt`
      )
    ).not.toThrow();

    // Making sure the build.gradle.kts file contains the good information
    const buildGradle = readFile(`libs/${libName}/build.gradle.kts`);
    expect(buildGradle.includes('org.acme')).toBeTruthy();
    expect(buildGradle.includes('0.0.1-SNAPSHOT')).toBeTruthy();

    const buildResult = await runNxCommandAsync(`build ${libName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    //should recreate build folder
    const localTmpDir = path.dirname(tmpProjPath());
    const targetDir = path.join(localTmpDir, 'proj', 'libs', libName, 'build');
    fse.removeSync(targetDir);
    expect(() => checkFilesExist(`libs/${libName}/build`)).toThrow();
    await runNxCommandAsync(`build ${libName}`);
    expect(() => checkFilesExist(`libs/${libName}/build`)).not.toThrow();

    const testResult = await runNxCommandAsync(`test ${libName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const formatResult = await runNxCommandAsync(`ktformat ${libName}`);
    expect(formatResult.stdout).toContain('Executor ran for Kotlin Format');

    const lintResult = await runNxCommandAsync(`lint ${libName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');
  }, 1200000);

  it('should create a library with the specified properties', async () => {
    const randomName = uniq('quarkus-gradle-lib-');
    const libDir = 'deep/subdir';
    const libName = `${normalizeName(libDir)}-${randomName}`;

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${randomName} --directory ${libDir} --tags e2etag,e2ePackage --groupId com.jnxplus --projectVersion 1.2.3`
    );

    expect(() =>
      checkFilesExist(
        `libs/${libDir}/${randomName}/build.gradle`,
        `libs/${libDir}/${randomName}/src/main/java/com/jnxplus/deep/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingService.java`,
        `libs/${libDir}/${randomName}/src/test/java/com/jnxplus/deep/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingServiceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`libs/${libDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`libs/${libDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${libName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${libName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${libName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${libName}`
    );
    expect(formatResult.stdout).toContain('');
  }, 1200000);

  it('should generare a lib with a simple package name', async () => {
    const randomName = uniq('quarkus-gradle-lib-');
    const libDir = 'deep/subdir';
    const libName = `${normalizeName(libDir)}-${randomName}`;

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${randomName} --directory ${libDir} --tags e2etag,e2ePackage --groupId com.jnxplus --packageNameType short --projectVersion 1.2.3`
    );

    expect(() =>
      checkFilesExist(
        `libs/${libDir}/${randomName}/build.gradle`,
        `libs/${libDir}/${randomName}/src/main/java/com/jnxplus/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingService.java`,
        `libs/${libDir}/${randomName}/src/test/java/com/jnxplus/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingServiceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good informations
    const buildGradle = readFile(`libs/${libDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`libs/${libDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${libName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${libName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${libName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${libName}`
    );
    expect(formatResult.stdout).toContain('');
  }, 1200000);

  it('--a lib with aliases', async () => {
    const randomName = uniq('quarkus-gradle-lib-');
    const libDir = 'subdir';
    const libName = `${libDir}-${randomName}`;

    await runNxCommandAsync(`g @jnxplus/nx-quarkus-gradle:init`);

    await runNxCommandAsync(
      `g @jnxplus/nx-quarkus-gradle:lib ${randomName} --dir ${libDir} --t e2etag,e2ePackage --groupId com.jnxplus --v 1.2.3`
    );

    expect(() =>
      checkFilesExist(
        `libs/${libDir}/${randomName}/build.gradle`,
        `libs/${libDir}/${randomName}/src/main/java/com/jnxplus/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingService.java`,
        `libs/${libDir}/${randomName}/src/test/java/com/jnxplus/subdir/${names(
          randomName
        ).className.toLocaleLowerCase()}/GreetingServiceTest.java`
      )
    ).not.toThrow();

    // Making sure the build.gradle file contains the good information
    const buildGradle = readFile(`libs/${libDir}/${randomName}/build.gradle`);
    expect(buildGradle.includes('com.jnxplus')).toBeTruthy();
    expect(buildGradle.includes('1.2.3')).toBeTruthy();

    //should add tags to project.json
    const projectJson = readJson(`libs/${libDir}/${randomName}/project.json`);
    expect(projectJson.tags).toEqual(['e2etag', 'e2ePackage']);

    const buildResult = await runNxCommandAsync(`build ${libName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${libName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const lintResult = await runNxCommandAsync(`lint ${libName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    const formatResult = await runNxCommandAsync(
      `format:check --projects ${libName}`
    );
    expect(formatResult.stdout).toContain('');
  }, 1200000);

  it('should add a lib to an app dependencies', async () => {
    const appName = uniq('quarkus-gradle-app-');
    const libName = uniq('quarkus-gradle-lib-');

    const rootProjectName = uniq('root-project-');
    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --rootProjectName ${rootProjectName}`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${appName}`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${libName} --projects ${appName}`
    );

    // Making sure the app build.gradle file contains the lib
    const buildGradle = readFile(`apps/${appName}/build.gradle`);
    expect(buildGradle.includes(`:libs:${libName}`)).toBeTruthy();

    const greetingResourcePath = `apps/${appName}/src/main/java/org/acme/${names(
      appName
    ).className.toLocaleLowerCase()}/GreetingResource.java`;
    const greetingResourceContent = readFile(greetingResourcePath);

    const regex1 = /package\s*org\.acme\..*\s*;/;

    const regex2 = /public\s*class\s*GreetingResource\s*{/;

    const regex3 = /"Hello World!"/;

    const newGreetingResourceContent = greetingResourceContent
      .replace(
        regex1,
        `$&\nimport javax.inject.Inject;\nimport org.acme.${names(
          libName
        ).className.toLocaleLowerCase()}.GreetingService;`
      )
      .replace(regex2, '$&\n@Inject\nGreetingService service;')
      .replace(regex3, 'service.greeting()');

    updateFile(greetingResourcePath, newGreetingResourceContent);

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const formatResult = await runNxCommandAsync(
      `format:write --projects ${appName}`
    );
    expect(formatResult.stdout).toContain('GreetingResource.java');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    await runNxCommandAsync(`dep-graph --file=dep-graph.json`);
    const depGraphJson = readJson('dep-graph.json');
    expect(depGraphJson.graph.nodes[rootProjectName]).toBeDefined();
    expect(depGraphJson.graph.nodes[appName]).toBeDefined();
    expect(depGraphJson.graph.nodes[libName]).toBeDefined();

    expect(depGraphJson.graph.dependencies[appName]).toContainEqual({
      type: 'static',
      source: appName,
      target: libName,
    });
  }, 1200000);

  it('should add a kotlin lib to a kotlin app dependencies', async () => {
    const appName = uniq('quarkus-gradle-app-');
    const libName = uniq('quarkus-gradle-lib-');

    const rootProjectName = uniq('root-project-name-');
    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:init --dsl kotlin --rootProjectName ${rootProjectName}`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:application ${appName} --language kotlin`
    );

    await runNxCommandAsync(
      `generate @jnxplus/nx-quarkus-gradle:library ${libName}  --language kotlin --projects ${appName}`
    );

    // Making sure the app build.gradle file contains the lib
    const buildGradle = readFile(`apps/${appName}/build.gradle.kts`);
    expect(buildGradle.includes(`:libs:${libName}`)).toBeTruthy();

    const greetingResourcePath = `apps/${appName}/src/main/kotlin/org/acme/${names(
      appName
    ).className.toLocaleLowerCase()}/GreetingResource.kt`;
    const greetingResourceContent = readFile(greetingResourcePath);

    const regex1 = /package\s*org\.acme\..*/;

    const regex2 = /class\s*GreetingResource/;

    const regex3 = /"Hello World!"/;

    const newGreetingResourceContent = greetingResourceContent
      .replace(
        regex1,
        `$&\nimport org.acme.${names(
          libName
        ).className.toLocaleLowerCase()}.GreetingService`
      )
      .replace(regex2, '$&(private val greetingService: GreetingService)')
      .replace(regex3, 'greetingService.greeting()');

    updateFile(greetingResourcePath, newGreetingResourceContent);

    const buildResult = await runNxCommandAsync(`build ${appName}`);
    expect(buildResult.stdout).toContain('Executor ran for Build');

    const testResult = await runNxCommandAsync(`test ${appName}`);
    expect(testResult.stdout).toContain('Executor ran for Test');

    const formatResult = await runNxCommandAsync(`ktformat ${appName}`);
    expect(formatResult.stdout).toContain('Executor ran for Kotlin Format');

    const lintResult = await runNxCommandAsync(`lint ${appName}`);
    expect(lintResult.stdout).toContain('Executor ran for Lint');

    await runNxCommandAsync(`dep-graph --file=dep-graph.json`);
    const depGraphJson = readJson('dep-graph.json');
    expect(depGraphJson.graph.nodes[rootProjectName]).toBeDefined();
    expect(depGraphJson.graph.nodes[appName]).toBeDefined();
    expect(depGraphJson.graph.nodes[libName]).toBeDefined();

    expect(depGraphJson.graph.dependencies[appName]).toContainEqual({
      type: 'static',
      source: appName,
      target: libName,
    });
  }, 1200000);
});