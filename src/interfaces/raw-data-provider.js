// @flow

export type NodeTipStatusType = {
  height: number,
  slot: [number, number],
  hash: string,
}

export type NodeStatusType = {
  packedEpochs: number,
  tip: {
    local: NodeTipStatusType,
    remote: NodeTipStatusType
  }
}

export interface RawDataProvider {
  postSignedTx(txPayload: string): Promise<any>;
  getBlock(id: string): Promise<string>;
  getEpoch(id: number): Promise<string>;
  getGenesis(hash: string): Promise<Object>;
  getStatus(): Promise<NodeStatusType>;
}
