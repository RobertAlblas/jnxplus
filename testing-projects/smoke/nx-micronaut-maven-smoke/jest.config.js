module.exports = {
  displayName: 'nx-micronaut-maven-smoke',
  preset: '../../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/smoke/nx-micronaut-maven-smoke',
};