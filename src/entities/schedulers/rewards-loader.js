// @flow

import path from 'path'

import type { Logger } from 'bunyan'

import chokidar from 'chokidar'
import fs from 'fs'
import csv from 'csv-parser'

import { helpers } from 'inversify-vanillajs-helpers'

import type { Database } from '../../interfaces'
import type { ShelleyTxType } from '../../blockchain/shelley/tx'

import SERVICE_IDENTIFIER from '../../constants/identifiers'

import BaseScheduler from './base-scheduler'

const epochFromPathRe = /reward\-info\-(?<epoch>\d+)-/g

const getEpochFromPath = (path: string): number => {
  const matchResult = epochFromPathRe.exec(path)
  if (matchResult !== null && matchResult !== undefined) {
    const { groups } = matchResult
    const epoch = groups !== null && groups !== undefined ? groups.epoch : 0
    return parseInt(epoch, 10)
  }
  return 0
}

class RewardsLoaderImpl extends BaseScheduler {
  jormunRewardsDirPath: string

  db: Database<ShelleyTxType>

  constructor(
    logger: Logger,
    jormunRewardsDirPath: string,
    db: Database<ShelleyTxType>,
  ) {
    super(logger)
    this.name = 'RewardsLoader'
    this.jormunRewardsDirPath = path.resolve(jormunRewardsDirPath)
    this.db = db
  }


  async run(): Promise<void> {
    this.logger.debug(`[${this.name}]: Subscribe for changes to ${this.jormunRewardsDirPath} dir.`)
    const csvData = []
    chokidar.watch(this.jormunRewardsDirPath).on('all', (event, path) => {
      const epoch = getEpochFromPath(path)
      if (epoch > 0) {
        fs.createReadStream(path)
          .pipe(csv())
          .on('data', (data) => {
            if (data.type === 'pool' || data.type === 'account') {
              csvData.push({
                epoch,
                ...data,
              })
            }
          })
          .on('end', () => {
            this.logger.debug(`Update rewards data from ${path}`)
            this.db.storeStakingRewards(csvData).then(() => {
              csvData.length = 0
            })
          })
      }
    })
  }
}

helpers.annotate(RewardsLoaderImpl,
  [
    SERVICE_IDENTIFIER.LOGGER,
    'jormunRewardsDirPath',
    SERVICE_IDENTIFIER.DATABASE,
  ])

export default RewardsLoaderImpl