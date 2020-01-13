// @flow

import _ from 'lodash'
import type { Logger } from 'bunyan'
import { helpers } from 'inversify-vanillajs-helpers'

import type { Scheduler, RawDataProvider, Database } from '../../interfaces'
import { TX_STATUS } from '../../blockchain/common'
import SERVICE_IDENTIFIER from '../../constants/identifiers'
import type { ShelleyTxType } from '../../blockchain/shelley/tx'
import { sleep } from '../../utils'

class MempoolChecker implements Scheduler {
  dataProvider: RawDataProvider

  logger: Logger

  checkMempoolMillis: number

  db: Database<ShelleyTxType>

  constructor(
    checkMempoolSeconds: number,
    logger: Logger,
    dataProvider: RawDataProvider,
    db: Database<ShelleyTxType>,
  ) {
    this.checkMempoolMillis = checkMempoolSeconds * 1000
    this.dataProvider = dataProvider
    this.db = db

    logger.debug('[MempoolChecker] Checking mempool every', checkMempoolSeconds, 'seconds')
    this.logger = logger
  }

  async updateFailedTxs(txHashes: Array<string>): Promise<void> {
    if (_.isEmpty(txHashes)) {
      return
    }
    await this.db.updateTxsStatus(txHashes, TX_STATUS.TX_FAILED_STATUS)
    for (const txHash of txHashes) {
      await this.db.addNewTxToTransientSnapshots(txHash, TX_STATUS.TX_FAILED_STATUS)
    }
  }

  async startAsync() {
    this.logger.info('[MempoolChecker] starting checking mempool for failed transactions.')
    for (;;) {
      const failedTxs = (await this.dataProvider.getMessagePoolLogs())
        .filter(msg => msg.status.Rejected !== undefined)
        .map(msg => msg.fragment_id)
      await this.updateFailedTxs(failedTxs)
      this.logger.debug(`Rejected txs: ${failedTxs}`)
      this.logger.debug('[MempoolChecker] async: loop finished')
      this.logger.debug('[GitHubLoader] async: sleeping for', this.checkMempoolMillis)
      await sleep(this.checkMempoolMillis)
    }
  }
}

helpers.annotate(MempoolChecker,
  [
    'checkMempoolSeconds',
    SERVICE_IDENTIFIER.LOGGER,
    SERVICE_IDENTIFIER.RAW_DATA_PROVIDER,
    SERVICE_IDENTIFIER.DATABASE,
  ])

export default MempoolChecker
