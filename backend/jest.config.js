/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@greenlink/shared$': '<rootDir>/../packages/shared/src/index.ts',
    '^@greenlink/shared/(.*)$': '<rootDir>/../packages/shared/src/$1'
  }
};
