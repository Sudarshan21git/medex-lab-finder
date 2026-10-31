export interface Test {
  id: string;
  code: string;
  name: string;
  price: number | null;
  status: boolean;
}

export interface Package {
  id: string;
  name: string;
  price: number;
  testIds: string[];
  status: boolean;
}

export interface RawCatalog {
  tests: Test[];
  packages: Package[];
  examples?: { request: { testIds: string[] }; expected: unknown }[];
}

export interface Catalog {
  tests: Test[];
  testById: Map<string, Test>;
  packages: Package[]; // only usable, cleaned packages
  warnings: string[]; // data problems we found
}