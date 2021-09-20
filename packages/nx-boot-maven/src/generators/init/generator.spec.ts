import { Tree } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import generator from './generator';
import { NxBootMavenGeneratorSchema } from './schema';

describe('init generator', () => {
  let appTree: Tree;
  const options: NxBootMavenGeneratorSchema = {
    groupId: '',
    projectVersion: '',
    javaVersion: '11',
    dsl: 'groovy',
    rootProjectName: 'test-boot-multiproject',
  };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace();
    appTree.write('./.gitignore', '');
    appTree.write('./.prettierignore', '');
  });

  it('should run successfully', async () => {
    await generator(appTree, options);
    const settingsGradleExists = appTree.exists('pom.xml');
    expect(settingsGradleExists).toBeTruthy();
  });
});
