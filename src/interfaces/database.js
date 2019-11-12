// @flow
import type { Block } from '../blockchain/common'

export interface Database {
  getBestBlockNum(): any;
  storeUtxos(utxos: Array<mixed>): Promise<any>;
  storeBlockTxs(block: any): Promise<void>;
  genesisLoaded(): Promise<boolean>;
  updateBestBlockNum(height: number): Promise<void>;
  getConn(): any;
  getOutputsForTxHashes(hashes: Array<string>): Promise<Array<{}>>;
  isTxExists(txId: string): Promise<boolean>;
  storeBlocks(blocks: Array<Block>): Promise<void>;
  storeNewSnapshot(block: Block): Promise<void>;
  rollBackTransactions(blockHeight: number): Promise<void>;
  rollbackTransientSnapshots(blockHeight: number): Promise<void>;
  rollBackUtxoBackup(blockHeight: number): Promise<void>;
  rollBackBlockHistory(blockHeight: number): Promise<void>;
}

export interface DBConnection {

}
