/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEGACY_MILESTONE_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
