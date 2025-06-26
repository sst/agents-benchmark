export interface Result {
  openCode: {
    share: string;
    version: string;
  };
  duration: number;
  gitRef: string;
  added: number;
  removed: number;
}
