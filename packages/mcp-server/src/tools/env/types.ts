export type EnvMode = 'development' | 'production';

export type ScanOptions = {
  apps?: string[];
  rootDir?: string;
  mode: EnvMode;
};

export type EnvDefinition = {
  key: string;
  value: string;
  source: string;
  /** 1-based line in the source file; absent for synthetic definitions. */
  line?: number;
};

export type EnvVariableState = {
  key: string;
  category: string;
  definitions: EnvDefinition[];
  effectiveValue: string;
  isOverridden: boolean;
  effectiveSource: string;
  isVisible: boolean;
  validation: {
    success: boolean;
    error: {
      issues: string[];
    };
  };
};

export type AppEnvState = {
  appName: string;
  filePath: string;
  mode: EnvMode;
  variables: Record<string, EnvVariableState>;
};

export type EnvFileInfo = {
  appName: string;
  filePath: string;

  variables: Array<{
    key: string;
    value: string;
    line?: number;
    source: string;
  }>;
};
