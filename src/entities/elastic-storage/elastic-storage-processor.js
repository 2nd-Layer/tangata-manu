// @flow

import _ from 'lodash'
import type { Logger } from 'bunyan'

import { helpers } from 'inversify-vanillajs-helpers'
import { Client } from '@elastic/elasticsearch'

import type { StorageProcessor, NetworkConfig } from '../../interfaces'
import type { Block } from '../../blockchain'
import type { BlockInfoType } from '../../interfaces/storage-processor'
import SERVICE_IDENTIFIER from '../../constants/identifiers'

import type { UtxoType } from './utxo-data'

import BigNumber from "bignumber.js"
import BlockData from './block-data'
import UtxoData, { getTxInputUtxoId } from './utxo-data'
import TxData from './tx-data'

const INDEX_SLOT = 'slot'
const INDEX_TX = 'tx'
const INDEX_TXIO = 'txio'
const INDEX_CHUNK = 'chunk'
const INDEX_POINTER_ALL = '*'


const ELASTIC_TEMPLATES = {
  seiza_tx: {
    index_patterns: ['seiza*.tx'],
    mappings: {
      properties: {
        addresses: {
          type: 'nested',
        },
      },
    },
  },
}

type ElasticConfigType = {
  node: string,
  indexPrefix: string,
}

type ChunkBodyType = {
  chunk: number,
  blocks: number,
  txs: number,
  txios: number,
}


type FormatBulkUploadOptionsType = {
  index: string,
  getId?: (any) => string,
  getData: (any) => {},
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const formatBulkUploadBody = (objs: any,
  options: FormatBulkUploadOptionsType) => objs.flatMap(o => [
  {
    index: {
      _index: options.index,
      _id: options.getId !== undefined ? options.getId(o) : o.getId(),
    },
  },
  options.getData(o),
])

const getBlocksForSlotIdx = (
  blocks: Array<Block>,
  storedUTxOs: Array<UtxoType>,
  txTrackedState: { [string]: any },
  addressStates: { [string]: any },
) => {
  const blocksData = blocks.map(
    block => (new BlockData(block, storedUTxOs, txTrackedState, addressStates)).toPlainObject())
  return blocksData
}

const getBlockUtxos = (block: Block) => {
  const blockUtxos = block.getTxs().flatMap(tx => tx.outputs.map(
    (out, idx) => (new UtxoData({
      tx_hash: tx.id,
      tx_index: idx,
      block_hash: block.hash,
      receiver: out.address,
      amount: out.value,
    })).toPlainObject(),
  ))
  return blockUtxos
}

const createAddressStateQuery = (uniqueBlockAddresses) => ({
  size: 0,
  aggs: {
    tmp_nest: {
      nested: {
        path: 'addresses',
      },
      aggs: {
        tmp_filter: {
          filter: {
            terms: {
              'addresses.address.keyword': uniqueBlockAddresses,
            },
          },
          aggs: {
            tmp_group_by: {
              terms: {
                field: 'addresses.address.keyword',
              },
              aggs: {
                tmp_select_latest: {
                  top_hits: {
                    size: 1,
                    sort: [
                      {
                        'addresses.tx_num_after_this_tx': {
                          order: 'desc',
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})


class ElasticStorageProcessor implements StorageProcessor {
  logger: Logger

  client: Client

  networkStartTime: number

  elasticConfig: ElasticConfigType

  lastChunk: number;

  constructor(
    logger: Logger,
    elasticConfig: ElasticConfigType,
    networkConfig: NetworkConfig,
  ) {
    this.logger = logger
    this.elasticConfig = elasticConfig
    this.client = new Client({ node: elasticConfig.node })
    this.networkStartTime = networkConfig.startTime()
  }

  indexFor(name: string) {
    // TOFO: memoize
    return `${this.elasticConfig.indexPrefix}.${name}`
  }

  async rollbackTo(height: number) {
    await sleep(10000)
    const latestStableChunk = await this.getLatestStableChunk()
    return this.deleteChunksAfter(Math.min(latestStableChunk, height))
  }

  async esSearch(params: {}) {
    const resp = await this.client.search(params)
    const { hits } = resp.body
    return hits
  }

  async getLatestStableChunk() {
    const index = this.indexFor(INDEX_CHUNK)
    const indexExists = (await this.client.indices.exists({
      index,
    })).body
    if (!indexExists) {
      return 0
    }
    const hits = await this.esSearch({
      index,
      allowNoIndices: true,
      ignoreUnavailable: true,
      body: {
        sort: [{ chunk: { order: 'desc' } }],
        size: 1,
      },
    })
    this.logger.debug('getLatestStableChunk', hits)
    return hits.total.value > 0 ? hits.hits[0]._source.chunk : 0
  }

  async deleteChunksAfter(chunk: number) {
    const resp = await this.client.deleteByQuery({
      index: this.indexFor(INDEX_POINTER_ALL),
      body: {
        query: { range: { _chunk: { gt: chunk } } },
      },
    })
    const deletedDocs = resp.body.total
    this.logger.info(`deleteChunksAfter(${chunk}), total deleted:${deletedDocs}`, resp)
  }

  async ensureElasticTemplates() {
    for (const [name, tmpl] of _.toPairs(ELASTIC_TEMPLATES)) {
      // eslint-disable-next-line no-await-in-loop
      const tmplExists = await this.client.indices.existsTemplate({
        name,
      })
      if (!tmplExists.body) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await this.client.indices.putTemplate({
          name,
          body: tmpl,
          include_type_name: false,
        })
        this.logger.debug(`Put template ${name}`, resp)
      }
    }
  }

  async storeChunk(chunkBody: ChunkBodyType) {
    return this.client.index({
      index: this.indexFor(INDEX_CHUNK),
      id: chunkBody.chunk,
      body: chunkBody,
    })
  }

  async removeUnsealed() {
    const lastChunk = await this.getLatestStableChunk()
    this.logger.debug('Remove unsealed blocks after', lastChunk)
    if (lastChunk > 0) {
      await this.deleteChunksAfter(lastChunk)
    }
  }

  async onLaunch() {
    await this.ensureElasticTemplates()
    await this.removeUnsealed()
    this.lastChunk = await this.getLatestStableChunk()
    this.logger.debug('Launched ElasticStorageProcessor storage processor.')
  }

  async genesisLoaded() {
    const index = this.indexFor(INDEX_TX)
    const indexExists = (await this.client.indices.exists({
      index,
    })).body
    if (!indexExists) {
      return false
    }
    const esResponse = await this.client.cat.count({
      index,
      format: 'json',
    })
    this.logger.debug('Check elastic whether genesis loaded...', esResponse)
    return Number(esResponse.body[0].count) > 0
  }

  async storeGenesisUtxos(utxos: Array<UtxoType>) {
    // TODO: check bulk upload response
    this.logger.debug('storeGenesisUtxos: store utxos to "txio" index and create fake txs in "tx" index')
    const chunk = ++this.lastChunk

    const utxosObjs = utxos.map((utxo) => new UtxoData(utxo))
    const txioBody = formatBulkUploadBody(utxosObjs, {
      index: this.indexFor(INDEX_TXIO),
      getData: (o) => ({
        ...o.toPlainObject(),
        _chunk: chunk,
      }),
    })
    const txBody = formatBulkUploadBody(utxosObjs, {
      index: this.indexFor(INDEX_TX),
      getId: (o) => o.getHash(),
      getData: (o) => ({
        ...TxData.fromGenesisUtxo(o.utxo, this.networkStartTime).toPlainObject(),
        _chunk: chunk,
      }),
    })

    const resp = await this.bulkUpload([...txioBody, ...txBody])
    await this.storeChunk({
      chunk,
      blocks: 0,
      txs: utxosObjs.length,
      txios: utxosObjs.length,
    })
    this.logger.debug('storeGenesisUtxos:tx', resp)
  }

  async getBestBlockNum(): Promise<BlockInfoType> {
    const emptyDb = { height: 0, epoch: 0 }
    const index = this.indexFor(INDEX_SLOT)
    const indexExists = (await this.client.indices.exists({
      index,
    })).body
    if (!indexExists) {
      return emptyDb
    }
    const esResponse = await this.client.search({
      index,
      body: {
        sort: [{ epoch: { order: 'desc' } }, { slot: { order: 'desc' } }],
        size: 1,
      },
    })
    const { hits } = esResponse.body.hits
    if (_.isEmpty(hits)) {
      return emptyDb
    }
    // eslint-disable-next-line no-underscore-dangle
    const source = hits[0]._source
    this.logger.debug('getBestBlockNum', source.height)
    return source
  }

  async bulkUpload(body: Array<mixed>) {
    const resp = await this.client.bulk({
      refresh: 'true',
      body,
    })
    this.logger.debug('bulkUpload', { ...resp, body: { ...resp.body, items: undefined } })
    return resp
  }

  async storeBlocksData(blocks: Array<Block>) {
    const storedUTxOs = []
    const utxosToStore = []
    const txInputsIds = []
    const blockTxs = []
    const chunk = ++this.lastChunk
    for (const block of blocks) {
      const txs = block.getTxs()
      if (txs.length > 0) {
        txInputsIds.push(..._.flatten(_.map(txs, 'inputs')).map(getTxInputUtxoId))
        this.logger.debug('storeBlocksData', block)
        utxosToStore.push(...getBlockUtxos(block))
        blockTxs.push(...txs)
      }
    }
    if (!_.isEmpty(txInputsIds)) {
      const txInputs = await this.client.mget({
        index: this.indexFor(INDEX_TXIO),
        body: {
          ids: txInputsIds,
        },
      })
      storedUTxOs.push(..._.map(txInputs.body.docs.filter(d => d.found), '_source'))
    }

    this.logger.debug('storeBlocksData.gettingLatestTxTrackedState')
    const txTrackedState = await this.getLatestTxTrackedState()

    // Inputs are resolved into UTxOs that are being spent
    // Plus all the UTxOs produced in the processed blocks
    const utxosForInputsAndOutputs = [...storedUTxOs, ...utxosToStore]

    this.logger.debug('storeBlocksData.processingAddressStates')
    // Filter all the unique addresses being used in either inputs or outputs
    const uniqueBlockAddresses = _.uniq(utxosForInputsAndOutputs.map(({ address }) => address))
    const addressStates: { [string]: any } = await this.getAddressStates(uniqueBlockAddresses)
    const blocksData = getBlocksForSlotIdx(blocks, utxosForInputsAndOutputs, txTrackedState, addressStates)

    const blocksBody = formatBulkUploadBody(blocksData, {
      index: this.indexFor(INDEX_SLOT),
      getId: (o) => o.hash,
      getData: o => ({
        ...o,
        _chunk: chunk,
      }),
    })
    const utxosBody = formatBulkUploadBody(utxosToStore, {
      index: this.indexFor(INDEX_TXIO),
      getId: (o) => o.id,
      getData: (o) => ({
        ...o,
        _chunk: chunk,
      }),
    })
    const txsBody = formatBulkUploadBody(blocksData.flatMap(b => b.tx), {
      index: this.indexFor(INDEX_TX),
      getId: (o) => o.hash,
      getData: (o) => o,
    })
    await this.bulkUpload([...utxosBody, ...blocksBody, ...txsBody])

    // Commit every 10th chunk
    if (chunk % 10 === 0) {
      await sleep(5000)
      await this.storeChunk({
        chunk,
        blocks: blocks.length,
        txs: blockTxs.length,
        txios: utxosToStore.length,
      })
      await sleep(5000)
    }
  }

  async getLatestTxTrackedState(): { [string]: any } {
    this.logger.debug('Querying latest tx-tracking state')
    const res = await this.esSearch({
      index: this.indexFor(INDEX_TX),
      allowNoIndices: true,
      ignoreUnavailable: true,
      body: {
        size: 1,
        query: { bool: { filter: { term: { is_genesis: false } } } },
        _source: ['supply_after_this_tx'],
        ...qSort(['epoch', 'desc'], ['slot', 'desc'], ['tx_ordinal', 'desc']),
      },
    })
    const hit = res.hits[0]
    this.logger.debug('Latest tx-tracking state hit: ', JSON.stringify(hit, null, 2))
    return {
      supply_after_this_tx: new BigNumber(hit ? hit._source.supply_after_this_tx.full : 0),
    }
  }

  async getAddressStates(uniqueBlockAddresses: Array<string>): { [string]: any } {
    const res = await this.client.search({
      index: this.indexFor(INDEX_TX),
      allowNoIndices: true,
      ignoreUnavailable: true,
      body: createAddressStateQuery(uniqueBlockAddresses),
    })
    const { buckets } = res.body.aggregations.tmp_nest.tmp_filter.tmp_group_by
    try {
      const states = buckets.map(buck => {
        const source = buck.tmp_select_latest.hits.hits[0]._source
        return { ...source, balance_after_this_tx: Number(source.balance_after_this_tx.full) }
      })
      return _.keyBy(states, 'address')
    } catch (e) {
      this.logger.error('Failed while processing this response:', JSON.stringify(res, null, 2))
      throw e
    }
  }
}

/*
 * Pass array of queries, where each query is one of:
 * 1. A string 'S' - then turned into `{ S: { order: 'asc' } }`
 * 2. An array [S, O] - then turned into '{ S: { order: O } }'
 * 3. An array [S, O, U] - then turned into '{ S: { order: O, unmapped_type: U } }'
 * 4. An object - passed directly
 *
 * The returned result is an object like: `{ sort: [ *E ] }`
 * Where `*E` are all entries transformed.
 *
 * Use it when constructing an Elastic query like:
 * {
 *   query: { ... },
 *   ...qSort('field1', ['field2', 'desc'])
 * }
 *
 * NOTE: `unmapped_type` is set to `long` for all entries except direct objects and arrays of length 3.
 */
function qSort(...entries) {
  const mapped = entries.map(e => {
    const res = {}
    let key
    let order = 'asc'
    let unmapped_type = 'long'
    if (Array.isArray(e)) {
      if (e.length < 1 || e.length > 3) {
        throw new Error("qSort array entry expect 1-3 elements!")
      }
      key = e[0]
      if (e.length > 1) {
        order = e[1]
      }
      if (e.length > 2) {
        unmapped_type = e[2]
      }
    } else if (typeof e === 'object') {
      return e
    } else {
      key = e
    }
    res[key] = { order, unmapped_type }
    return res
  })
  return { sort: mapped }
}

helpers.annotate(ElasticStorageProcessor,
  [
    SERVICE_IDENTIFIER.LOGGER,
    'elastic',
    SERVICE_IDENTIFIER.NETWORK_CONFIG,
  ])


export default ElasticStorageProcessor
