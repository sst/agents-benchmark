export interface Result {
  test: string;
  model: string;
  opencode: {
    share: string;
    version: string;
  };
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  cost: number;
  duration: number;
  gitRef: string;
  diffs: {
    file: string;
    added: number;
    removed: number;
  }[];
}
