// @flow

import cbor from 'cbor'

import utils from './utils'

import type { TxType } from './tx'

const SLOTS_IN_EPOCH = 21600

export type HeaderType = Array<any>

export default class Block {
  hash: string

  prevHash: string

  slot: ?number

  epoch: number

  height: number

  txs: Array<TxType>

  isEBB: boolean

  time: Date

  lead: ?string

  constructor({
    hash, slot, epoch, height, txs, isEBB, prevHash,
    time, lead,
  }: {hash: string,
    slot: ?number,
    epoch: number,
    height: number,
    txs: Array<TxType>,
    isEBB: boolean,
    prevHash: string,
    time: Date,
    lead: ?string,
  }) {
    this.hash = hash
    this.prevHash = prevHash
    this.slot = slot
    this.epoch = epoch
    this.height = height
    this.txs = txs
    this.isEBB = isEBB
    this.time = time
    this.lead = lead
  }

  serialize() {
    return {
      block_hash: this.hash,
      epoch: this.epoch,
      slot: this.slot,
      block_height: this.height,
    }
  }

  static handleEpochBoundaryBlock(header: HeaderType) {
    const [epoch, [chainDifficulty]] = header[3]
    const lead = null
    return {
      epoch,
      time: new Date(),
      lead,
      height: chainDifficulty,
      isEBB: true,
      slot: null,
      txs: [],
    }
  }

  static handleRegularBlock(header: HeaderType, body: {}, blockHash: string,
    networkStartTime: number) {
    const consensus = header[3]
    const [epoch, slot] = consensus[0]
    const lead = null
    const [chainDifficulty] = consensus[2]
    const txs = body[0]
    const [upd1, upd2] = body[3]
    const blockTime = new Date(
      (networkStartTime
      + (epoch * SLOTS_IN_EPOCH + slot) * 20)
      * 1000)

    const res = {
      slot,
      epoch,
      lead,
      time: blockTime,
      isEBB: false,
      upd: (upd1.length || upd2.length) ? [upd1, upd2] : null,
      height: chainDifficulty,
      txs: txs.map((tx, index) => utils.rawTxToObj(tx, {
        txTime: blockTime,
        txOrdinal: index,
        blockNum: chainDifficulty,
        blockHash,
      })),
    }
    return res
  }

  static parseBlock(blob: Buffer, handleRegularBlock: number): Block {
    const [type, [header, body]] = cbor.decode(blob)
    const hash = utils.headerToId(header, type)
    const common = {
      hash,
      magic: header[0],
      prevHash: header[1].toString('hex'),
    }
    let blockData
    switch (type) {
      case 0:
        blockData = { ...common, ...Block.handleEpochBoundaryBlock(header) }
        break
      case 1:
        blockData = {
          ...common,
          ...Block.handleRegularBlock(header, body, hash, handleRegularBlock),
        }
        break
      default:
        throw new Error(`Unexpected block type! ${type}`)
    }
    return new Block(blockData)
  }

  static fromCBOR(data: Buffer, handleRegularBlock: number) {
    const block = Block.parseBlock(data, handleRegularBlock)
    return block
  }
}
