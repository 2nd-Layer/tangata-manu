// @flow
export interface RawDataProvider {
  getBlock(id: string): Promise<string>;
  getEpoch(id: number): Promise<string>;
}
