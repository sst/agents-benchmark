export interface Result {
  opencode: {
    share: string;
    version: string;
  };
  cost: number;
  duration: number;
  gitRef: string;
  added: number;
  removed: number;
}
